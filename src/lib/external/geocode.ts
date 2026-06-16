import { fetchWithTimeout } from "./fetch-timeout";

export interface GeoPoint {
  lat: number;
  lon: number;
  label: string;
}

/** Resolve a restaurant address to coordinates for weather APIs. */
export async function geocodeLocation(
  address: string | null | undefined,
  name: string
): Promise<GeoPoint | null> {
  const queries = [
    [address, name].filter(Boolean).join(", "),
    name,
    address,
  ].filter((q): q is string => Boolean(q && q.trim()));

  for (const query of queries) {
    try {
      const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=1&language=en&format=json`;
      const res = await fetchWithTimeout(url, { next: { revalidate: 86400 } });
      if (!res.ok) continue;
      const data = (await res.json()) as {
        results?: Array<{ latitude: number; longitude: number; name: string; admin1?: string; country?: string }>;
      };
      const hit = data.results?.[0];
      if (hit) {
        return {
          lat: hit.latitude,
          lon: hit.longitude,
          label: [hit.name, hit.admin1, hit.country].filter(Boolean).join(", "),
        };
      }
    } catch {
      continue;
    }
  }
  return null;
}
