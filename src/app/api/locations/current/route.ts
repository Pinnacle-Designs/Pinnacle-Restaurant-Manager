import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSecureAuth } from "@/lib/api-auth";
import { getLocationIdFromRequest } from "@/lib/location";
import { privateJsonResponse } from "@/lib/secure-response";
import {
  syncLocationGeoFields,
  locationForGeocoding,
  locationGeoInputsChanged,
} from "@/lib/location/geo";
import { resolveLocationLocale } from "@/lib/location/locale";
import { syncExternalFactorsForLocation } from "@/lib/external/sync-weather";
import { locationNowLabel } from "@/lib/location/time";

const locationSelect = {
  id: true,
  name: true,
  address: true,
  phone: true,
  seatCount: true,
  postalCode: true,
  city: true,
  stateProvince: true,
  countryCode: true,
  timezone: true,
  currencyCode: true,
  measurementSystem: true,
  volumeStandard: true,
  locale: true,
  latitude: true,
  longitude: true,
} as const;

export async function GET(request: NextRequest) {
  const { user, error } = await requireSecureAuth(request);
  if (error) return error;

  const locationId = await getLocationIdFromRequest(request);
  if (!locationId) {
    return privateJsonResponse({ error: "No location assigned" }, { status: 404 });
  }

  const location = await prisma.location.findUnique({
    where: { id: locationId },
    select: locationSelect,
  });

  if (!location) {
    return privateJsonResponse({ error: "Location not found" }, { status: 404 });
  }

  return privateJsonResponse({
    location,
    localTime: locationNowLabel(location.timezone),
    canEdit: user!.role === "OWNER",
  });
}

export async function PATCH(request: NextRequest) {
  const { user, error } = await requireSecureAuth(request);
  if (error) return error;

  if (user!.role !== "OWNER" || !user!.locationId) {
    return privateJsonResponse({ error: "Only owners can update location settings" }, { status: 403 });
  }

  const body = await request.json();
  const name = body.name != null ? String(body.name).trim().slice(0, 120) : undefined;
  const address = body.address != null ? String(body.address).trim().slice(0, 240) : undefined;
  const phone = body.phone != null ? String(body.phone).trim().slice(0, 40) : undefined;
  const postalCode =
    body.postalCode != null ? String(body.postalCode).trim().slice(0, 20) : undefined;
  const city = body.city != null ? String(body.city).trim().slice(0, 80) : undefined;
  const stateProvince =
    body.stateProvince != null ? String(body.stateProvince).trim().slice(0, 40) : undefined;
  const countryCode =
    body.countryCode != null ? String(body.countryCode).trim().slice(0, 2).toUpperCase() : undefined;
  const seatCount =
    body.seatCount != null ? Math.max(1, Math.min(500, Number(body.seatCount))) : undefined;

  const existing = await prisma.location.findUnique({
    where: { id: user!.locationId },
    select: locationSelect,
  });
  if (!existing) {
    return privateJsonResponse({ error: "Location not found" }, { status: 404 });
  }

  const merged = {
    ...existing,
    name: name ?? existing.name,
    address: address ?? existing.address,
    phone: phone ?? existing.phone,
    postalCode: postalCode ?? existing.postalCode,
    city: city ?? existing.city,
    stateProvince: stateProvince ?? existing.stateProvince,
    countryCode: countryCode ?? existing.countryCode,
    seatCount: seatCount ?? existing.seatCount,
  };

  const geoInputsChanged = locationGeoInputsChanged(existing, merged);
  // Always re-geocode from current form values so a corrected postal code replaces stale coordinates.
  const geo = await syncLocationGeoFields(locationForGeocoding(merged));

  const backfillFromGeo = Boolean(geo && merged.postalCode?.trim());
  const effectiveCountry = geo?.countryCode ?? merged.countryCode ?? "US";
  const regional = resolveLocationLocale(effectiveCountry);

  const updated = await prisma.location.update({
    where: { id: user!.locationId },
    data: {
      ...(name != null ? { name } : {}),
      ...(address !== undefined ? { address: address || null } : {}),
      ...(phone !== undefined ? { phone: phone || null } : {}),
      ...(postalCode !== undefined ? { postalCode: postalCode || null } : {}),
      ...(seatCount != null ? { seatCount } : {}),
      ...(geo?.countryCode && merged.postalCode?.trim()
        ? { countryCode: geo.countryCode }
        : countryCode != null
          ? { countryCode }
          : {}),
      currencyCode: regional.currencyCode,
      measurementSystem: regional.measurementSystem,
      volumeStandard: regional.volumeStandard,
      locale: regional.locale,
      ...(backfillFromGeo && geo?.city ? { city: geo.city } : city !== undefined ? { city: city || null } : {}),
      ...(backfillFromGeo && geo?.stateProvince
        ? { stateProvince: geo.stateProvince }
        : stateProvince !== undefined
          ? { stateProvince: stateProvince || null }
          : {}),
      ...(geo
        ? {
            latitude: geo.latitude,
            longitude: geo.longitude,
            timezone: geo.timezone,
          }
        : geoInputsChanged && merged.postalCode?.trim()
          ? { latitude: null, longitude: null, timezone: null }
          : {}),
    },
    select: locationSelect,
  });

  let syncResult = null;
  if (geo) {
    try {
      syncResult = await syncExternalFactorsForLocation(updated.id, updated);
    } catch (err) {
      console.warn("External factor sync after location save:", err);
    }
  }

  return privateJsonResponse({
    location: updated,
    geo: geo ? { label: geo.geoLabel, timezone: geo.timezone } : null,
    geoResolved: Boolean(geo),
    regional,
    localTime: locationNowLabel(updated.timezone),
    sync: syncResult,
    message: geo
      ? `Location saved — ${regional.currencyCode}, ${regional.measurementSystem} units (${regional.volumeStandard} volume), local time, weather, and holidays synced`
      : merged.postalCode?.trim()
        ? "Location saved — we couldn't verify that postal code. Check country and try again."
        : "Location saved — add a valid postal code to enable weather & holidays",
  });
}
