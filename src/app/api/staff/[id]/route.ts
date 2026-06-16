import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, stripSalaries } from "@/lib/api-auth";
import { hashClockPin, isValidClockPin } from "@/lib/timeclock/clock-pin";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, error } = await requirePermission(request, "edit_staff");
  if (error) return error;

  const { id } = await params;
  const body = await request.json();

  const existing = await prisma.staffMember.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const activeChanging = body.active !== undefined && body.active !== existing.active;
  const terminationPatch =
    activeChanging && body.active === false
      ? { terminatedAt: new Date(), terminationReason: body.terminationReason ?? existing.terminationReason }
      : activeChanging && body.active === true
        ? { terminatedAt: null, terminationReason: null }
        : {};

  let clockPinPatch: { clockPinHash?: string | null } = {};
  if (body.clockPin !== undefined) {
    if (body.clockPin === "" || body.clockPin === null) {
      clockPinPatch = { clockPinHash: null };
    } else if (!isValidClockPin(String(body.clockPin))) {
      return NextResponse.json(
        { error: "Clock PIN must be 4–6 digits" },
        { status: 400 }
      );
    } else {
      clockPinPatch = { clockPinHash: hashClockPin(String(body.clockPin)) };
    }
  }

  const member = await prisma.staffMember.update({
    where: { id },
    data: {
      name: body.name,
      role: body.role,
      email: body.email,
      phone: body.phone,
      hourlyRate: body.hourlyRate,
      isTippedEmployee: body.isTippedEmployee,
      tipPoints: body.tipPoints,
      active: body.active,
      imageUrl: body.imageUrl,
      hireDate:
        body.hireDate !== undefined
          ? body.hireDate
            ? new Date(body.hireDate)
            : null
          : undefined,
      terminationReason:
        body.terminationReason !== undefined ? body.terminationReason : undefined,
      dateOfBirth: body.dateOfBirth !== undefined
        ? body.dateOfBirth
          ? new Date(body.dateOfBirth)
          : null
        : undefined,
      ...terminationPatch,
      ...clockPinPatch,
    },
  });

  return NextResponse.json(stripSalaries(user!.role, [member])[0]);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requirePermission(request, "edit_staff");
  if (error) return error;

  const { id } = await params;
  await prisma.staffMember.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
