import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/api-auth";
import { getLocationIdFromRequest } from "@/lib/location";
import { validateShiftForMinor, violationsToError } from "@/lib/compliance/validate-shift";
import { tenantNotFoundResponse, tenantWhere } from "@/lib/tenant-resource";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requirePermission(request, "manage_schedule");
  if (error) return error;

  const { id } = await params;
  const locationId = await getLocationIdFromRequest(request);
  const body = await request.json();

  const existing = await prisma.shift.findFirst({
    where: tenantWhere(id, locationId),
    include: { staffMember: true },
  });
  if (!existing) {
    return tenantNotFoundResponse("Shift not found");
  }

  const staffMemberId = body.staffMemberId ?? existing.staffMemberId;
  const shiftDate = body.date ? new Date(body.date) : existing.date;
  const startTime = body.startTime ?? existing.startTime;
  const endTime = body.endTime ?? existing.endTime;

  if (staffMemberId) {
    const { violations, blocked } = await validateShiftForMinor({
      locationId: existing.locationId,
      staffMemberId,
      shiftDate,
      startTime,
      endTime,
      excludeShiftId: id,
      complianceOverride: Boolean(body.complianceOverride),
    });

    if (blocked) {
      return NextResponse.json(
        { error: violationsToError(violations), violations, code: "MINOR_LABOR_BLOCK" },
        { status: 422 }
      );
    }
  }

  const shift = await prisma.shift.update({
    where: tenantWhere(id, locationId),
    data: {
      staffMemberId: body.staffMemberId,
      date: body.date ? new Date(body.date) : undefined,
      startTime: body.startTime,
      endTime: body.endTime,
      workRole: body.workRole !== undefined ? body.workRole || null : undefined,
      notes: body.notes,
    },
    include: { staffMember: true },
  });

  return NextResponse.json({ ...shift, date: shift.date.toISOString() });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requirePermission(request, "manage_schedule");
  if (error) return error;

  const { id } = await params;
  const locationId = await getLocationIdFromRequest(request);
  const existing = await prisma.shift.findFirst({
    where: tenantWhere(id, locationId),
    select: { id: true },
  });
  if (!existing) {
    return tenantNotFoundResponse("Shift not found");
  }

  await prisma.shift.delete({ where: tenantWhere(id, locationId) });
  return NextResponse.json({ success: true });
}
