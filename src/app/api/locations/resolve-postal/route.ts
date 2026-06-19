import { NextRequest } from "next/server";
import { requireSecureAuth } from "@/lib/api-auth";
import { privateJsonResponse } from "@/lib/secure-response";
import { geocodePostalAutoDetect } from "@/lib/external/geocode";
import { resolveLocationLocale, measurementSystemLabel } from "@/lib/location/locale";
import { fetchTimezoneFromCoords } from "@/lib/location/geo";
import { locationNowLabel } from "@/lib/location/time";

/** Preview country, currency, and measurement system from a postal/ZIP code. */
export async function POST(request: NextRequest) {
  const { user, error } = await requireSecureAuth(request);
  if (error) return error;

  if (!user!.locationId) {
    return privateJsonResponse({ error: "No location assigned" }, { status: 404 });
  }

  const body = await request.json();
  const postalCode = String(body.postalCode ?? "").trim();
  const hintCountry = body.countryCode ? String(body.countryCode).trim().toUpperCase() : undefined;

  if (!postalCode || postalCode.length < 3) {
    return privateJsonResponse({ error: "Enter a postal or ZIP code" }, { status: 400 });
  }

  const geo = await geocodePostalAutoDetect(postalCode, hintCountry);
  if (!geo?.countryCode) {
    return privateJsonResponse({
      resolved: false,
      message: "Could not identify location from that postal code",
    });
  }

  const regional = resolveLocationLocale(geo.countryCode);
  const timezone = await fetchTimezoneFromCoords(geo.lat, geo.lon);

  return privateJsonResponse({
    resolved: true,
    postalCode,
    countryCode: geo.countryCode,
    city: geo.city,
    stateProvince: geo.stateProvince,
    label: geo.label,
    timezone,
    localTime: locationNowLabel(timezone),
    regional,
    measurementLabel: measurementSystemLabel(regional),
  });
}
