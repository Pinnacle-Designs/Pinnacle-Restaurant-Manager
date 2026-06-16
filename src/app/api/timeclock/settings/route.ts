import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getLocationIdFromRequest } from "@/lib/location";
import { requirePermission } from "@/lib/api-auth";
import { geocodeLocation } from "@/lib/external/geocode";
import { PUNCH_VERIFICATION_MODES } from "@/lib/timeclock/types";

const locationSelect = {
  name: true,
  address: true,
  latitude: true,
  longitude: true,
  geoFenceRadiusM: true,
  geoClockInRequired: true,
  punchPhotoRequired: true,
  punchVerificationMode: true,
  earlyClockInBufferMins: true,
  forgottenClockOutGraceMins: true,
  blockUnscheduledPunch: true,
} as const;

export async function GET(request: NextRequest) {
  const { error } = await requirePermission(request, "manage_schedule");
  if (error) return error;

  const locationId = await getLocationIdFromRequest(request);
  const location = await prisma.location.findUnique({
    where: { id: locationId },
    select: locationSelect,
  });

  if (!location) {
    return NextResponse.json({ error: "Location not found" }, { status: 404 });
  }

  return NextResponse.json({ location, modes: PUNCH_VERIFICATION_MODES });
}

export async function PATCH(request: NextRequest) {
  const { error } = await requirePermission(request, "manage_schedule");
  if (error) return error;

  const locationId = await getLocationIdFromRequest(request);
  const body = await request.json();

  const data: Record<string, unknown> = {};

  if (typeof body.geoClockInRequired === "boolean") {
    data.geoClockInRequired = body.geoClockInRequired;
  }
  if (typeof body.punchPhotoRequired === "boolean") {
    data.punchPhotoRequired = body.punchPhotoRequired;
  }
  if (typeof body.blockUnscheduledPunch === "boolean") {
    data.blockUnscheduledPunch = body.blockUnscheduledPunch;
  }
  if (body.punchVerificationMode && PUNCH_VERIFICATION_MODES.includes(body.punchVerificationMode)) {
    data.punchVerificationMode = body.punchVerificationMode;
  }
  if (body.geoFenceRadiusM != null) {
    const radius = Number(body.geoFenceRadiusM);
    if (radius >= 25 && radius <= 500) data.geoFenceRadiusM = Math.round(radius);
  }
  if (body.earlyClockInBufferMins != null) {
    const buffer = Number(body.earlyClockInBufferMins);
    if (buffer >= 0 && buffer <= 120) data.earlyClockInBufferMins = Math.round(buffer);
  }
  if (body.forgottenClockOutGraceMins != null) {
    const grace = Number(body.forgottenClockOutGraceMins);
    if (grace >= 0 && grace <= 180) data.forgottenClockOutGraceMins = Math.round(grace);
  }
  if (body.latitude != null && body.longitude != null) {
    const lat = Number(body.latitude);
    const lng = Number(body.longitude);
    if (!Number.isNaN(lat) && !Number.isNaN(lng)) {
      data.latitude = lat;
      data.longitude = lng;
    }
  }
  if (body.geocodeFromAddress === true) {
    const loc = await prisma.location.findUnique({
      where: { id: locationId },
      select: { address: true, name: true },
    });
    if (loc) {
      const point = await geocodeLocation(loc.address, loc.name);
      if (point) {
        data.latitude = point.lat;
        data.longitude = point.lon;
      }
    }
  }

  const location = await prisma.location.update({
    where: { id: locationId },
    data,
    select: locationSelect,
  });

  return NextResponse.json({ location });
}
