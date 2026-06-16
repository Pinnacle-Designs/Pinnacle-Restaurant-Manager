import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getLocationIdFromRequest } from "@/lib/location";
import { requirePermission } from "@/lib/api-auth";
import { getForgottenClockOutWarnings } from "@/lib/timeclock/forgotten-clock-out";

export async function GET(request: NextRequest) {
  const { error } = await requirePermission(request, "manage_schedule");
  if (error) return error;

  const locationId = await getLocationIdFromRequest(request);
  const result = await getForgottenClockOutWarnings(locationId);
  return NextResponse.json(result);
}

/** Manager resolves a forgotten clock-out by setting clock-out to scheduled shift end. */
export async function POST(request: NextRequest) {
  const { user, error } = await requirePermission(request, "manage_schedule");
  if (error) return error;

  const locationId = await getLocationIdFromRequest(request);
  const body = await request.json();

  if (body.action !== "clock_out_at_shift_end" || !body.entryId) {
    return NextResponse.json({ error: "entryId and action required" }, { status: 400 });
  }

  const { warnings } = await getForgottenClockOutWarnings(locationId);
  const warning = warnings.find((w) => w.entryId === body.entryId);
  if (!warning) {
    return NextResponse.json(
      { error: "No active forgotten clock-out warning for this punch" },
      { status: 404 }
    );
  }

  const clockOutAt = new Date(warning.scheduledEnd);
  const existing = await prisma.timeEntry.findFirst({
    where: { id: body.entryId, locationId, clockOutAt: null },
  });
  if (!existing) {
    return NextResponse.json({ error: "Open punch not found" }, { status: 404 });
  }
  if (clockOutAt <= existing.clockInAt) {
    return NextResponse.json({ error: "Scheduled end is before clock-in" }, { status: 400 });
  }

  const entry = await prisma.timeEntry.update({
    where: { id: existing.id },
    data: {
      clockOutAt,
      mealBreakTaken: existing.mealBreakTaken ?? true,
      restBreakTaken: existing.restBreakTaken ?? true,
      notes: existing.notes
        ? `${existing.notes} · Manager clock-out at scheduled end (forgotten punch)`
        : "Manager clock-out at scheduled end (forgotten punch)",
      editedByUserId: user!.id,
      editedAt: new Date(),
    },
    include: {
      staffMember: { select: { id: true, name: true, role: true } },
    },
  });

  await prisma.activityLog.create({
    data: {
      locationId,
      action: "FORGOTTEN_CLOCK_OUT_RESOLVED",
      entity: "time_entry",
      entityId: entry.id,
      details: `${entry.staffMember.name} clocked out at scheduled end (${warning.scheduledEndLabel}) — prevented phantom hours`,
    },
  });

  return NextResponse.json({
    ok: true,
    entry: {
      id: entry.id,
      staffName: entry.staffMember.name,
      clockOutAt: entry.clockOutAt!.toISOString(),
    },
  });
}
