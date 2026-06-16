/** Haversine distance in meters between two lat/lng points. */
export function distanceMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function isWithinGeoFence(
  lat: number,
  lng: number,
  centerLat: number,
  centerLng: number,
  radiusMeters: number
): boolean {
  return distanceMeters(lat, lng, centerLat, centerLng) <= radiusMeters;
}

export function verifyGeoClockIn(
  lat: number | null | undefined,
  lng: number | null | undefined,
  location: {
    latitude: number | null;
    longitude: number | null;
    geoFenceRadiusM: number;
    geoClockInRequired: boolean;
  }
): { ok: boolean; verified: boolean; error?: string } {
  if (!location.geoClockInRequired) {
    return { ok: true, verified: false };
  }

  if (location.latitude == null || location.longitude == null) {
    return {
      ok: process.env.NODE_ENV === "development",
      verified: false,
      error:
        process.env.NODE_ENV === "development"
          ? undefined
          : "Restaurant location is not configured for geo clock-in. Ask your manager.",
    };
  }

  if (lat == null || lng == null) {
    if (process.env.NODE_ENV === "development") {
      return { ok: true, verified: false };
    }
    return {
      ok: false,
      verified: false,
      error: "Location permission required to clock in at the restaurant.",
    };
  }

  const verified = isWithinGeoFence(
    lat,
    lng,
    location.latitude,
    location.longitude,
    location.geoFenceRadiusM
  );

  if (!verified) {
    if (process.env.NODE_ENV === "development") {
      return { ok: true, verified: false };
    }
    const distance = Math.round(
      distanceMeters(lat, lng, location.latitude, location.longitude)
    );
    return {
      ok: false,
      verified: false,
      error: `You must be on restaurant property to punch (${distance}m away, max ${location.geoFenceRadiusM}m). Move inside the geofence and try again.`,
    };
  }

  return { ok: true, verified: true };
}
