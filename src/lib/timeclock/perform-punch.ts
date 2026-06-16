import { prisma } from "@/lib/prisma";
import { startOfDay } from "date-fns";
import { verifyGeoClockIn } from "@/lib/timeclock/geo";
import { verifyPunchIdentity } from "@/lib/timeclock/verify-punch";
import { savePunchPhoto } from "@/lib/timeclock/save-punch-photo";
import { checkEarlyClockIn } from "@/lib/timeclock/early-clock-in";
import { verifyClockPin } from "@/lib/timeclock/clock-pin";

type LocationRow = {
  id: string;
  latitude: number | null;
  longitude: number | null;
  geoFenceRadiusM: number;
  geoClockInRequired: boolean;
  punchPhotoRequired: boolean;
  punchVerificationMode: string;
  earlyClockInBufferMins: number;
  blockUnscheduledPunch: boolean;
  mealBreakMinutes: number;
  restBreakMinutes: number;
};

export type PunchInput = {
  action: "in" | "out";
  staffMemberId: string;
  pin: string;
  latitude?: number | null;
  longitude?: number | null;
  photoDataUrl?: string | null;
  biometricVerified?: boolean;
  mealBreakTaken?: boolean;
  restBreakTaken?: boolean;
  notes?: string | null;
};

export async function performKioskPunch(locationId: string, input: PunchInput) {
  const staff = await prisma.staffMember.findFirst({
    where: { id: input.staffMemberId, locationId, active: true },
  });

  if (!staff) {
    return { ok: false as const, status: 404, error: "Staff member not found" };
  }

  if (!staff.clockPinHash) {
    return {
      ok: false as const,
      status: 400,
      error: "No clock PIN set. Ask your manager to set one on your profile.",
    };
  }

  if (!verifyClockPin(input.pin, staff.clockPinHash)) {
    return { ok: false as const, status: 401, error: "Incorrect PIN. Try again." };
  }

  const location = await prisma.location.findUnique({ where: { id: locationId } });
  if (!location) {
    return { ok: false as const, status: 404, error: "Location not found" };
  }

  const geo = verifyGeoClockIn(input.latitude, input.longitude, location);
  if (!geo.ok) {
    return { ok: false as const, status: 400, error: geo.error ?? "Location check failed" };
  }

  if (input.action === "in") {
    return clockIn(staff, location, input, geo.verified);
  }

  return clockOut(staff, location, input, geo.verified);
}

async function clockIn(
  staff: { id: string; userId: string | null; name: string },
  location: LocationRow,
  input: PunchInput,
  geoVerified: boolean
) {
  const existing = await prisma.timeEntry.findFirst({
    where: { staffMemberId: staff.id, clockOutAt: null },
  });
  if (existing) {
    return { ok: false as const, status: 400, error: `${staff.name} is already clocked in` };
  }

  const today = startOfDay(new Date());
  const match = await prisma.shift.findFirst({
    where: {
      locationId: location.id,
      staffMemberId: staff.id,
      date: { gte: today, lt: new Date(today.getTime() + 86400000) },
    },
    orderBy: { startTime: "asc" },
  });

  const early = checkEarlyClockIn(
    new Date(),
    match,
    location.earlyClockInBufferMins,
    location.blockUnscheduledPunch
  );
  if (!early.ok) {
    return { ok: false as const, status: 400, error: early.error };
  }

  const identity = verifyPunchIdentity(location, {
    photoDataUrl: input.photoDataUrl,
    biometricVerified: Boolean(input.biometricVerified),
  });
  if (!identity.ok) {
    return { ok: false as const, status: 400, error: identity.error };
  }

  let clockInPhotoUrl: string | null = null;
  if (identity.method === "PHOTO" && input.photoDataUrl) {
    try {
      clockInPhotoUrl = await savePunchPhoto(input.photoDataUrl);
    } catch (err) {
      return {
        ok: false as const,
        status: 400,
        error: err instanceof Error ? err.message : "Could not save punch photo",
      };
    }
  }

  const entry = await prisma.timeEntry.create({
    data: {
      locationId: location.id,
      staffMemberId: staff.id,
      userId: staff.userId,
      shiftId: match?.id ?? null,
      clockInAt: new Date(),
      clockInLat: input.latitude ?? null,
      clockInLng: input.longitude ?? null,
      geoVerifiedIn: geoVerified,
      clockInPhotoUrl,
      identityVerifiedIn: identity.verified,
      identityMethodIn: identity.method ?? null,
    },
  });

  return {
    ok: true as const,
    action: "in" as const,
    staffName: staff.name,
    entry: {
      id: entry.id,
      clockInAt: entry.clockInAt.toISOString(),
    },
  };
}

async function clockOut(
  staff: { id: string; name: string },
  location: LocationRow,
  input: PunchInput,
  geoVerified: boolean
) {
  const openEntry = await prisma.timeEntry.findFirst({
    where: { staffMemberId: staff.id, clockOutAt: null },
    orderBy: { clockInAt: "desc" },
  });
  if (!openEntry) {
    return { ok: false as const, status: 400, error: `${staff.name} is not clocked in` };
  }

  if (input.mealBreakTaken === undefined || input.restBreakTaken === undefined) {
    return {
      ok: false as const,
      status: 400,
      error: "Break attestation required before clock out.",
    };
  }

  let clockOutPhotoUrl: string | null = null;
  let identityVerifiedOut = false;
  let identityMethodOut: string | null = null;

  if (location.punchPhotoRequired && (input.photoDataUrl || input.biometricVerified)) {
    const identity = verifyPunchIdentity(location, {
      photoDataUrl: input.photoDataUrl,
      biometricVerified: Boolean(input.biometricVerified),
    });
    if (identity.ok && identity.method === "PHOTO" && input.photoDataUrl) {
      try {
        clockOutPhotoUrl = await savePunchPhoto(input.photoDataUrl);
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
      clockOutLat: input.latitude ?? null,
      clockOutLng: input.longitude ?? null,
      geoVerifiedOut: geoVerified,
      clockOutPhotoUrl,
      identityVerifiedOut,
      identityMethodOut,
      mealBreakTaken: Boolean(input.mealBreakTaken),
      restBreakTaken: Boolean(input.restBreakTaken),
      breakAttestedAt: new Date(),
      notes: input.notes?.trim() || null,
      approvalStatus: "PENDING",
    },
  });

  return {
    ok: true as const,
    action: "out" as const,
    staffName: staff.name,
    entry: {
      id: entry.id,
      clockInAt: entry.clockInAt.toISOString(),
      clockOutAt: entry.clockOutAt?.toISOString() ?? null,
    },
  };
}
