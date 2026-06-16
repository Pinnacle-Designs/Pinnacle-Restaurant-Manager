import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getLocationIdFromRequest } from "@/lib/location";
import { requireAuth } from "@/lib/api-auth";
import { performKioskPunch } from "@/lib/timeclock/perform-punch";
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
  const { user, error } = await requireAuth(request);
  if (error) return error;

  const locationId = await getLocationIdFromRequest(request);
  const location = await prisma.location.findUnique({
    where: { id: locationId },
    select: locationSelect,
  });

  if (!location) {
    return NextResponse.json({ error: "Location not found" }, { status: 404 });
  }

  const staffMembers = await prisma.staffMember.findMany({
    where: { locationId, active: true },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      role: true,
      imageUrl: true,
      clockPinHash: true,
      userId: true,
    },
  });

  const openEntries = await prisma.timeEntry.findMany({
    where: { locationId, clockOutAt: null },
    select: { staffMemberId: true, clockInAt: true },
  });
  const clockedInMap = new Map(openEntries.map((e) => [e.staffMemberId, e.clockInAt]));

  const today = startOfDay(new Date());
  const todayShifts = await prisma.shift.findMany({
    where: {
      locationId,
      date: { gte: today, lt: new Date(today.getTime() + 86400000) },
    },
    select: { staffMemberId: true, startTime: true, endTime: true },
  });
  const shiftsByStaff = new Map<string, { startTime: string; endTime: string }[]>();
  for (const s of todayShifts) {
    if (!s.staffMemberId) continue;
    const list = shiftsByStaff.get(s.staffMemberId) ?? [];
    list.push({ startTime: s.startTime, endTime: s.endTime });
    shiftsByStaff.set(s.staffMemberId, list);
  }

  return NextResponse.json({
    location,
    staff: staffMembers.map((s) => ({
      id: s.id,
      name: s.name,
      role: s.role,
      imageUrl: s.imageUrl,
      hasPin: Boolean(s.clockPinHash),
      hasLinkedAccount: Boolean(s.userId),
      clockedIn: clockedInMap.has(s.id),
      clockInAt: clockedInMap.get(s.id)?.toISOString() ?? null,
      todayShifts: shiftsByStaff.get(s.id) ?? [],
    })),
    serverTime: new Date().toISOString(),
  });
}

export async function POST(request: NextRequest) {
  const { error } = await requireAuth(request);
  if (error) return error;

  const locationId = await getLocationIdFromRequest(request);
  const body = await request.json();

  const action = body.action === "out" ? "out" : "in";
  if (!body.staffMemberId || !body.pin) {
    return NextResponse.json({ error: "Staff and PIN required" }, { status: 400 });
  }

  const result = await performKioskPunch(locationId, {
    action,
    staffMemberId: String(body.staffMemberId),
    pin: String(body.pin),
    latitude: body.latitude,
    longitude: body.longitude,
    photoDataUrl: body.photoDataUrl,
    biometricVerified: Boolean(body.biometricVerified),
    mealBreakTaken: body.mealBreakTaken,
    restBreakTaken: body.restBreakTaken,
    notes: body.notes,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(result);
}
