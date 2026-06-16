import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getLocationIdFromRequest } from "@/lib/location";
import { requirePermission } from "@/lib/api-auth";

function serializeEntry(entry: Awaited<ReturnType<typeof prisma.timeEntry.update>> & {
  staffMember?: { id: string; name: string; role: string };
  shift?: { id: string; startTime: string; endTime: string; date: Date } | null;
}) {
  return {
    ...entry,
    clockInAt: entry.clockInAt.toISOString(),
    clockOutAt: entry.clockOutAt?.toISOString() ?? null,
    breakAttestedAt: entry.breakAttestedAt?.toISOString() ?? null,
    approvedAt: entry.approvedAt?.toISOString() ?? null,
    editedAt: entry.editedAt?.toISOString() ?? null,
    createdAt: entry.createdAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString(),
    shift: entry.shift
      ? { ...entry.shift, date: entry.shift.date.toISOString() }
      : null,
  };
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, error } = await requirePermission(request, "manage_schedule");
  if (error) return error;

  const { id } = await params;
  const locationId = await getLocationIdFromRequest(request);
  const body = await request.json();

  const existing = await prisma.timeEntry.findFirst({
    where: { id, locationId },
  });
  if (!existing) {
    return NextResponse.json({ error: "Time punch not found" }, { status: 404 });
  }

  const data: Record<string, unknown> = {};

  if (body.action === "approve") {
    if (!existing.clockOutAt) {
      return NextResponse.json({ error: "Cannot approve an open punch — employee still clocked in" }, { status: 400 });
    }
    data.approvalStatus = "APPROVED";
    data.approvedByUserId = user!.id;
    data.approvedAt = new Date();
  } else {
    if (body.clockInAt !== undefined) {
      const clockInAt = new Date(body.clockInAt);
      if (Number.isNaN(clockInAt.getTime())) {
        return NextResponse.json({ error: "Invalid clock-in time" }, { status: 400 });
      }
      data.clockInAt = clockInAt;
    }
    if (body.clockOutAt !== undefined) {
      if (body.clockOutAt === null || body.clockOutAt === "") {
        data.clockOutAt = null;
      } else {
        const clockOutAt = new Date(body.clockOutAt);
        if (Number.isNaN(clockOutAt.getTime())) {
          return NextResponse.json({ error: "Invalid clock-out time" }, { status: 400 });
        }
        data.clockOutAt = clockOutAt;
      }
    }
    if (body.notes !== undefined) {
      data.notes = body.notes?.trim() || null;
    }
    if (body.approvalStatus === "APPROVED" || body.approvalStatus === "PENDING") {
      data.approvalStatus = body.approvalStatus;
      if (body.approvalStatus === "APPROVED") {
        data.approvedByUserId = user!.id;
        data.approvedAt = new Date();
      }
    }
    if (Object.keys(data).length > 0) {
      data.editedByUserId = user!.id;
      data.editedAt = new Date();
    }
  }

  const clockInAt = (data.clockInAt as Date | undefined) ?? existing.clockInAt;
  const clockOutAt =
    data.clockOutAt !== undefined ? (data.clockOutAt as Date | null) : existing.clockOutAt;
  if (clockOutAt && clockOutAt <= clockInAt) {
    return NextResponse.json({ error: "Clock out must be after clock in" }, { status: 400 });
  }

  const entry = await prisma.timeEntry.update({
    where: { id },
    data,
    include: {
      staffMember: { select: { id: true, name: true, role: true } },
      shift: { select: { id: true, startTime: true, endTime: true, date: true } },
    },
  });

  return NextResponse.json({ entry: serializeEntry(entry) });
}
