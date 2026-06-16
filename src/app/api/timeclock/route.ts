import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getLocationIdFromRequest } from "@/lib/location";
import { requireAnyPermission } from "@/lib/api-auth";
import { resolveStaffMemberForUser } from "@/lib/staff-resolve";
import { verifyGeoClockIn } from "@/lib/timeclock/geo";
import { verifyPunchIdentity } from "@/lib/timeclock/verify-punch";
import { savePunchPhoto } from "@/lib/timeclock/save-punch-photo";
import { checkEarlyClockIn } from "@/lib/timeclock/early-clock-in";
import { startOfDay } from "date-fns";

const locationSelect = {
  name: true,
  latitude: true,
  longitude: true,
  geoFenceRadiusM: true,
  geoClockInRequired: true,
  punchPhotoRequired: true,
  punchVerificationMode: true,
  earlyClockInBufferMins: true,
  blockUnscheduledPunch: true,
  mealBreakMinutes: true,
  restBreakMinutes: true,
} as const;

export async function GET(request: NextRequest) {
  const { user, error } = await requireAnyPermission(request, ["clock_in", "manage_schedule"]);
  if (error) return error;

  const locationId = await getLocationIdFromRequest(request);
  const staff = await resolveStaffMemberForUser(user!, locationId);
  if (!staff) {
    return NextResponse.json(
      { error: "No staff profile linked to your account. Ask your manager to add you to the roster." },
      { status: 404 }
    );
  }

  const location = await prisma.location.findUnique({
    where: { id: locationId },
    select: locationSelect,
  });

  const openEntry = await prisma.timeEntry.findFirst({
    where: { staffMemberId: staff.id, clockOutAt: null },
    orderBy: { clockInAt: "desc" },
    include: { shift: true },
  });

  const today = startOfDay(new Date());
  const todayShifts = await prisma.shift.findMany({
    where: {
      locationId,
      staffMemberId: staff.id,
      date: { gte: today, lt: new Date(today.getTime() + 86400000) },
    },
    orderBy: { startTime: "asc" },
  });

  let biometricEnrolled = false;
  try {
    biometricEnrolled =
      (await prisma.webAuthnCredential.count({ where: { userId: user!.id } })) > 0;
  } catch {
    biometricEnrolled = false;
  }

  return NextResponse.json({
    staff: { id: staff.id, name: staff.name, role: staff.role },
    location,
    clockedIn: !!openEntry,
    biometricEnrolled,
    activeEntry: openEntry
      ? {
          ...openEntry,
          clockInAt: openEntry.clockInAt.toISOString(),
          clockOutAt: openEntry.clockOutAt?.toISOString() ?? null,
        }
      : null,
    todayShifts: todayShifts.map((s) => ({ ...s, date: s.date.toISOString() })),
  });
}

export async function POST(request: NextRequest) {
  const { user, error } = await requireAnyPermission(request, ["clock_in"]);
  if (error) return error;

  const locationId = await getLocationIdFromRequest(request);
  const staff = await resolveStaffMemberForUser(user!, locationId);
  if (!staff) {
    return NextResponse.json({ error: "Staff profile not found" }, { status: 404 });
  }

  const existing = await prisma.timeEntry.findFirst({
    where: { staffMemberId: staff.id, clockOutAt: null },
  });
  if (existing) {
    return NextResponse.json({ error: "Already clocked in" }, { status: 400 });
  }

  const body = await request.json();
  const location = await prisma.location.findUnique({ where: { id: locationId } });
  if (!location) {
    return NextResponse.json({ error: "Location not found" }, { status: 404 });
  }

  const geo = verifyGeoClockIn(body.latitude, body.longitude, location);
  if (!geo.ok) {
    return NextResponse.json({ error: geo.error }, { status: 400 });
  }

  const today = startOfDay(new Date());
  let shiftId: string | null = body.shiftId ?? null;
  let shiftForCheck: { date: Date; startTime: string } | null = null;

  if (shiftId) {
    const shift = await prisma.shift.findFirst({
      where: { id: shiftId, locationId, staffMemberId: staff.id },
    });
    shiftForCheck = shift;
  } else {
    const match = await prisma.shift.findFirst({
      where: {
        locationId,
        staffMemberId: staff.id,
        date: { gte: today, lt: new Date(today.getTime() + 86400000) },
      },
      orderBy: { startTime: "asc" },
    });
    shiftId = match?.id ?? null;
    shiftForCheck = match;
  }

  const early = checkEarlyClockIn(
    new Date(),
    shiftForCheck,
    location.earlyClockInBufferMins,
    location.blockUnscheduledPunch
  );
  if (!early.ok) {
    return NextResponse.json({ error: early.error }, { status: 400 });
  }

  const identity = verifyPunchIdentity(location, {
    photoDataUrl: body.photoDataUrl,
    biometricVerified: Boolean(body.biometricVerified),
  });
  if (!identity.ok) {
    return NextResponse.json({ error: identity.error }, { status: 400 });
  }

  let clockInPhotoUrl: string | null = null;
  if (identity.method === "PHOTO" && body.photoDataUrl) {
    try {
      clockInPhotoUrl = await savePunchPhoto(body.photoDataUrl);
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Could not save punch photo" },
        { status: 400 }
      );
    }
  }

  const entry = await prisma.timeEntry.create({
    data: {
      locationId,
      staffMemberId: staff.id,
      userId: user!.id,
      shiftId,
      clockInAt: new Date(),
      clockInLat: body.latitude ?? null,
      clockInLng: body.longitude ?? null,
      geoVerifiedIn: geo.verified,
      clockInPhotoUrl,
      identityVerifiedIn: identity.verified,
      identityMethodIn: identity.method ?? null,
    },
  });

  return NextResponse.json({
    entry: {
      ...entry,
      clockInAt: entry.clockInAt.toISOString(),
    },
  });
}

export async function PATCH(request: NextRequest) {
  const { user, error } = await requireAnyPermission(request, ["clock_in"]);
  if (error) return error;

  const locationId = await getLocationIdFromRequest(request);
  const staff = await resolveStaffMemberForUser(user!, locationId);
  if (!staff) {
    return NextResponse.json({ error: "Staff profile not found" }, { status: 404 });
  }

  const body = await request.json();
  const openEntry = await prisma.timeEntry.findFirst({
    where: { staffMemberId: staff.id, clockOutAt: null },
    orderBy: { clockInAt: "desc" },
  });
  if (!openEntry) {
    return NextResponse.json({ error: "Not clocked in" }, { status: 400 });
  }

  if (body.mealBreakTaken === undefined || body.restBreakTaken === undefined) {
    return NextResponse.json(
      { error: "Break attestation required: confirm meal and rest breaks received." },
      { status: 400 }
    );
  }

  const location = await prisma.location.findUnique({ where: { id: locationId } });
  if (!location) {
    return NextResponse.json({ error: "Location not found" }, { status: 404 });
  }

  const geo = verifyGeoClockIn(body.latitude, body.longitude, location);

  let clockOutPhotoUrl: string | null = null;
  let identityVerifiedOut = false;
  let identityMethodOut: string | null = null;

  if (location.punchPhotoRequired && body.photoDataUrl) {
    const identity = verifyPunchIdentity(location, {
      photoDataUrl: body.photoDataUrl,
      biometricVerified: Boolean(body.biometricVerified),
    });
    if (identity.ok && identity.method === "PHOTO") {
      try {
        clockOutPhotoUrl = await savePunchPhoto(body.photoDataUrl);
        identityVerifiedOut = true;
        identityMethodOut = "PHOTO";
      } catch {
        // optional on clock out
      }
    } else if (identity.ok && identity.method === "BIOMETRIC") {
      identityVerifiedOut = true;
      identityMethodOut = "BIOMETRIC";
    }
  }

  const entry = await prisma.timeEntry.update({
    where: { id: openEntry.id },
    data: {
      clockOutAt: new Date(),
      clockOutLat: body.latitude ?? null,
      clockOutLng: body.longitude ?? null,
      geoVerifiedOut: geo.verified,
      clockOutPhotoUrl,
      identityVerifiedOut,
      identityMethodOut,
      mealBreakTaken: Boolean(body.mealBreakTaken),
      restBreakTaken: Boolean(body.restBreakTaken),
      breakAttestedAt: new Date(),
      notes: body.notes?.trim() || null,
      approvalStatus: "PENDING",
    },
  });

  return NextResponse.json({
    entry: {
      ...entry,
      clockInAt: entry.clockInAt.toISOString(),
      clockOutAt: entry.clockOutAt?.toISOString() ?? null,
      breakAttestedAt: entry.breakAttestedAt?.toISOString() ?? null,
    },
  });
}
