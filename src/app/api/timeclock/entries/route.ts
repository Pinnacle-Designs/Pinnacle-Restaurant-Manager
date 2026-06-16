import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getLocationIdFromRequest } from "@/lib/location";
import { requirePermission, requireAnyPermission } from "@/lib/api-auth";
import { resolveStaffMemberForUser } from "@/lib/staff-resolve";
import { userCan } from "@/lib/permission-resolve";
import { subDays } from "date-fns";

function serializeEntry(e: {
  id: string;
  staffMemberId: string;
  clockInAt: Date;
  clockOutAt: Date | null;
  geoVerifiedIn: boolean;
  geoVerifiedOut: boolean;
  identityVerifiedIn: boolean;
  identityVerifiedOut: boolean;
  identityMethodIn: string | null;
  clockInPhotoUrl: string | null;
  clockOutPhotoUrl: string | null;
  mealBreakTaken: boolean | null;
  restBreakTaken: boolean | null;
  notes: string | null;
  approvalStatus: string;
  approvedAt: Date | null;
  editedAt: Date | null;
  staffMember: { id: string; name: string; role: string };
  shift?: { startTime: string; endTime: string; date: Date } | null;
}) {
  return {
    id: e.id,
    staffMemberId: e.staffMemberId,
    staffMember: e.staffMember,
    clockInAt: e.clockInAt.toISOString(),
    clockOutAt: e.clockOutAt?.toISOString() ?? null,
    geoVerifiedIn: e.geoVerifiedIn,
    geoVerifiedOut: e.geoVerifiedOut,
    identityVerifiedIn: e.identityVerifiedIn,
    identityVerifiedOut: e.identityVerifiedOut,
    identityMethodIn: e.identityMethodIn,
    clockInPhotoUrl: e.clockInPhotoUrl,
    clockOutPhotoUrl: e.clockOutPhotoUrl,
    mealBreakTaken: e.mealBreakTaken,
    restBreakTaken: e.restBreakTaken,
    notes: e.notes,
    approvalStatus: e.approvalStatus,
    approvedAt: e.approvedAt?.toISOString() ?? null,
    editedAt: e.editedAt?.toISOString() ?? null,
    shift: e.shift
      ? {
          startTime: e.shift.startTime,
          endTime: e.shift.endTime,
          date: e.shift.date.toISOString(),
        }
      : null,
  };
}

export async function GET(request: NextRequest) {
  const { user, error } = await requireAnyPermission(request, ["manage_schedule", "clock_in"]);
  if (error) return error;

  const locationId = await getLocationIdFromRequest(request);
  const from = request.nextUrl.searchParams.get("from");
  const to = request.nextUrl.searchParams.get("to");
  const status = request.nextUrl.searchParams.get("status");
  const staffMemberId = request.nextUrl.searchParams.get("staffMemberId");

  const canManage = await userCan(user!, "manage_schedule");

  const where: {
    locationId: string;
    clockInAt?: { gte?: Date; lte?: Date };
    approvalStatus?: string;
    staffMemberId?: string;
  } = { locationId };

  if (!canManage) {
    const staff = await resolveStaffMemberForUser(user!, locationId);
    if (!staff) {
      return NextResponse.json({ error: "Staff profile not found" }, { status: 404 });
    }
    where.staffMemberId = staff.id;
  } else if (staffMemberId) {
    where.staffMemberId = staffMemberId;
  }

  if (status === "PENDING" || status === "APPROVED") {
    where.approvalStatus = status;
  }

  if (from) {
    where.clockInAt = { ...where.clockInAt, gte: new Date(from) };
  } else if (canManage) {
    where.clockInAt = { gte: subDays(new Date(), 14) };
  } else {
    where.clockInAt = { gte: subDays(new Date(), 30) };
  }
  if (to) where.clockInAt = { ...where.clockInAt, lte: new Date(to) };

  const entries = await prisma.timeEntry.findMany({
    where,
    include: {
      staffMember: { select: { id: true, name: true, role: true } },
      shift: { select: { startTime: true, endTime: true, date: true } },
    },
    orderBy: { clockInAt: "desc" },
    take: canManage ? 200 : 50,
  });

  const pendingCount = canManage
    ? await prisma.timeEntry.count({
        where: { locationId, approvalStatus: "PENDING", clockOutAt: { not: null } },
      })
    : 0;

  return NextResponse.json({
    entries: entries.map(serializeEntry),
    pendingCount,
    canManage,
  });
}
