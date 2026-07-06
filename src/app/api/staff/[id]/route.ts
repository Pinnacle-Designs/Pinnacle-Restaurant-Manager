import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, stripSalaries } from "@/lib/api-auth";
import { hashClockPin, isValidClockPin, verifyClockPin } from "@/lib/timeclock/clock-pin";
import {
  assertPinAvailableAtLocation,
  enrichStaffForClient,
  syncStaffAppLoginUser,
} from "@/lib/staff-app-login";

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

  const appLoginEnabled =
    body.appLoginEnabled !== undefined ? Boolean(body.appLoginEnabled) : Boolean(existing.userId);

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
      if (!appLoginEnabled) {
        clockPinPatch = { clockPinHash: null };
      }
    } else {
      const pin = String(body.clockPin);
      if (!isValidClockPin(pin)) {
        return NextResponse.json({ error: "PIN must be 4–6 digits" }, { status: 400 });
      }
      try {
        await assertPinAvailableAtLocation(existing.locationId, pin, existing.id);
      } catch (err) {
        return NextResponse.json(
          { error: err instanceof Error ? err.message : "PIN unavailable" },
          { status: 400 }
        );
      }
      clockPinPatch = { clockPinHash: hashClockPin(pin) };
    }
  }

  const nextActive = body.active !== undefined ? Boolean(body.active) : existing.active;
  const nextName = body.name !== undefined ? body.name : existing.name;
  const nextRole = body.role !== undefined ? body.role : existing.role;

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
      dateOfBirth:
        body.dateOfBirth !== undefined
          ? body.dateOfBirth
            ? new Date(body.dateOfBirth)
            : null
          : undefined,
      ...terminationPatch,
      ...clockPinPatch,
    },
  });

  const pinForUser =
    body.clockPin !== undefined && body.clockPin !== "" && body.clockPin !== null
      ? String(body.clockPin)
      : undefined;

  await syncStaffAppLoginUser({
    staffMemberId: member.id,
    locationId: member.locationId,
    name: nextName,
    jobRole: nextRole,
    appLoginEnabled,
    pin: pinForUser,
    active: nextActive,
    existingUserId: existing.userId,
    existingClockPinHash: member.clockPinHash,
  });

  const refreshed = await prisma.staffMember.findUniqueOrThrow({ where: { id: member.id } });

  return NextResponse.json(
    enrichStaffForClient(stripSalaries(user!.role, [refreshed])[0])
  );
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requirePermission(request, "edit_staff");
  if (error) return error;

  const { id } = await params;
  const existing = await prisma.staffMember.findUnique({
    where: { id },
    select: { userId: true },
  });

  if (existing?.userId) {
    await prisma.user.update({
      where: { id: existing.userId },
      data: { active: false },
    });
  }

  await prisma.staffMember.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
