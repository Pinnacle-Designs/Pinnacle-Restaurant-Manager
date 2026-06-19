import { fetchWithTimeout } from "./fetch-timeout";

export interface GeoPoint {
  lat: number;
  lon: number;
  label: string;
  city?: string | null;
  stateProvince?: string | null;
  postalCode?: string | null;
  countryCode?: string | null;
}

export interface StructuredAddress {
  name: string;
  address?: string | null;
  postalCode?: string | null;
  city?: string | null;
  stateProvince?: string | null;
  countryCode?: string;
}

/** Countries supported by zippopotam.us for postal lookup */
const ZIPPO_COUNTRY_CODES = [
  "US", "CA", "GB", "DE", "FR", "ES", "IT", "AU", "NZ", "JP", "MX", "BR",
  "AT", "CH", "NL", "BE", "PT", "PL", "NO", "SE", "DK", "FI", "CZ", "SK",
  "HU", "RO", "TR", "IN", "SG", "HK", "IE", "LU", "LI", "MC", "AD", "AR",
  "CL", "CO", "PK", "MY", "TH", "PH", "ZA", "KR", "TW", "IL", "GR", "BG",
  "HR", "SI", "EE", "LV", "LT", "IS", "MT", "CY", "PE", "VE", "UY",
] as const;

const ZIPPO_SET = new Set<string>(ZIPPO_COUNTRY_CODES);

function countryLabel(code: string): string {
  const labels: Record<string, string> = {
    US: "United States",
    CA: "Canada",
    GB: "United Kingdom",
    AU: "Australia",
    DE: "Germany",
    FR: "France",
    ES: "Spain",
    IT: "Italy",
    MX: "Mexico",
    BR: "Brazil",
    JP: "Japan",
    NZ: "New Zealand",
  };
  return labels[code] ?? code;
}

function normalizePostal(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, " ");
}

function postalMatchesResult(requested: string, hit: GeocodeHit): boolean {
  const zip = normalizePostal(requested);
  const postcodes = hit.postcodes ?? (hit.postcode ? [hit.postcode] : []);
  if (postcodes.length === 0) return true;
  return postcodes.some((p) => {
    const pc = normalizePostal(String(p));
    return pc === zip || pc.startsWith(zip) || zip.startsWith(pc);
  });
}

interface GeocodeHit {
  latitude: number;
  longitude: number;
  name: string;
  admin1?: string;
  country?: string;
  country_code?: string;
  postcode?: string;
  postcodes?: string[];
}

function hitToPoint(hit: GeocodeHit, postalCode?: string | null): GeoPoint {
  return {
    lat: hit.latitude,
    lon: hit.longitude,
    label: [hit.name, hit.admin1, postalCode ?? hit.postcode, hit.country].filter(Boolean).join(", "),
    city: hit.name ?? null,
    stateProvince: hit.admin1 ?? null,
    postalCode: postalCode ?? hit.postcode ?? null,
    countryCode: hit.country_code?.toUpperCase() ?? null,
  };
}

/**
 * Guess likely ISO countries from postal/ZIP format so we can resolve location
 * (and measurement system) from postal code alone.
 */
export function guessCountriesForPostal(postalCode: string): string[] {
  const raw = postalCode.trim();
  const p = normalizePostal(raw);
  const guesses: string[] = [];

  // UK / Crown dependencies (e.g. SW1A 1AA, M1 1AE)
  if (/^[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}$/.test(p)) {
    guesses.push("GB", "IM", "GG", "JE");
  }

  // Canada (A1A 1A1)
  if (/^[A-CEGHJ-NPR-TVXY]\d[A-CEGHJ-NPR-TV-Z]\d[A-CEGHJ-NPR-TV-Z]\d$/.test(p.replace(/\s/g, ""))) {
    guesses.push("CA");
  }

  // US ZIP / ZIP+4
  if (/^\d{5}(-\d{4})?$/.test(raw)) {
    guesses.push("US");
  }

  // Japan (123-4567 or 1234567)
  if (/^\d{3}-?\d{4}$/.test(raw)) {
    guesses.push("JP");
  }

  // Brazil (12345-678)
  if (/^\d{5}-?\d{3}$/.test(raw)) {
    guesses.push("BR");
  }

  // Netherlands (1234 AB)
  if (/^\d{4}\s?[A-Z]{2}$/.test(p)) {
    guesses.push("NL");
  }

  // Poland (12-345)
  if (/^\d{2}-?\d{3}$/.test(raw)) {
    guesses.push("PL");
  }

  // Portugal (1234-567)
  if (/^\d{4}-?\d{3}$/.test(raw)) {
    guesses.push("PT");
  }

  // Ireland Eircode (A65 F4E2)
  if (/^[A-Z]\d{2}\s?[A-Z0-9]{4}$/.test(p)) {
    guesses.push("IE");
  }

  // Australia / NZ / many others — 4 digits
  if (/^\d{4}$/.test(raw)) {
    guesses.push("AU", "NZ", "NO", "DK", "CH", "AT", "BE", "LU", "ZA");
  }

  // Generic 5-digit (DE, FR, ES, IT, MX, etc.)
  if (/^\d{5}$/.test(raw)) {
    guesses.push("DE", "FR", "ES", "IT", "MX", "TR", "FI", "SE", "CZ", "SK", "GR", "TH", "MY", "PH");
  }

  // India 6-digit PIN
  if (/^\d{6}$/.test(raw)) {
    guesses.push("IN");
  }

  return [...new Set(guesses)];
}

/** Build geocode search queries — postal/ZIP first for accuracy. */
export function buildGeocodeQueries(input: StructuredAddress): string[] {
  const cc = input.countryCode ?? "US";
  const country = countryLabel(cc);
  const queries: string[] = [];

  if (input.postalCode?.trim()) {
    const zip = input.postalCode.trim();
    queries.push([zip, country].join(", "));
    if (input.city?.trim() || input.stateProvince?.trim()) {
      queries.push(
        [zip, input.city, input.stateProvince, country].filter(Boolean).join(", ")
      );
    }
  }

  if (!input.postalCode?.trim()) {
    if (input.city?.trim() && input.stateProvince?.trim()) {
      queries.push([input.city, input.stateProvince, country].filter(Boolean).join(", "));
    }
    if (input.address?.trim()) {
      queries.push(
        [input.address, input.city, input.stateProvince, country].filter(Boolean).join(", ")
      );
    }
    queries.push(
      [input.address, input.name].filter(Boolean).join(", "),
      input.name,
      input.address ?? ""
    );
  }

  return [...new Set(queries.filter((q) => q.trim().length > 2))];
}

async function searchGeocode(
  query: string,
  options?: { postalCode?: string | null }
): Promise<GeoPoint | null> {
  try {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=5&language=en&format=json`;
    const res = await fetchWithTimeout(url, { cache: "no-store" });
    if (!res.ok) return null;
    const data = (await res.json()) as { results?: GeocodeHit[] };
    const results = data.results ?? [];
    const zip = options?.postalCode?.trim();
    const hit = zip
      ? results.find((r) => postalMatchesResult(zip, r)) ?? results[0]
      : results[0];
    if (!hit) return null;
    if (zip && !postalMatchesResult(zip, hit)) return null;
    return hitToPoint(hit, zip);
  } catch {
    return null;
  }
}

/** Zippopotam.us — precise lat/lng + country for postal codes. */
async function geocodePostalViaZippopotam(
  postalCode: string,
  countryCode: string
): Promise<GeoPoint | null> {
  const cc = countryCode.toLowerCase();
  if (!ZIPPO_SET.has(countryCode.toUpperCase())) {
    return null;
  }
  const zip = postalCode.trim();
  try {
    const url = `https://api.zippopotam.us/${cc}/${encodeURIComponent(zip)}`;
    const res = await fetchWithTimeout(url, { cache: "no-store" });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      country?: string;
      "country abbreviation"?: string;
      "post code"?: string;
      places?: Array<{
        latitude: string;
        longitude: string;
        "place name"?: string;
        "state abbreviation"?: string;
        state?: string;
      }>;
    };
    const place = data.places?.[0];
    if (!place) return null;
    const lat = Number(place.latitude);
    const lon = Number(place.longitude);
    if (Number.isNaN(lat) || Number.isNaN(lon)) return null;
    const city = place["place name"] ?? null;
    const state = place["state abbreviation"] ?? place.state ?? null;
    const resolvedCountry = (data["country abbreviation"] ?? countryCode).toUpperCase();
    return {
      lat,
      lon,
      label: [city, state, data["post code"] ?? zip, data.country].filter(Boolean).join(", "),
      city,
      stateProvince: state,
      postalCode: data["post code"] ?? zip,
      countryCode: resolvedCountry,
    };
  } catch {
    return null;
  }
}

/** Resolve postal/ZIP across likely countries — drives auto measurement switch. */
export async function geocodePostalAutoDetect(
  postalCode: string,
  hintCountryCode?: string | null
): Promise<GeoPoint | null> {
  const zip = postalCode.trim();
  if (!zip) return null;

  const fromFormat = guessCountriesForPostal(zip);
  const hint = hintCountryCode?.trim().toUpperCase();
  const toTry = [
    ...(hint ? [hint] : []),
    ...fromFormat,
    ...ZIPPO_COUNTRY_CODES.filter((c) => c !== hint && !fromFormat.includes(c)),
  ];
  const seen = new Set<string>();

  for (const cc of toTry) {
    if (seen.has(cc)) continue;
    seen.add(cc);

    const zippo = await geocodePostalViaZippopotam(zip, cc);
    if (zippo) return zippo;

    const hit = await searchGeocode(`${zip}, ${countryLabel(cc)}`, { postalCode: zip });
    if (hit?.countryCode) return hit;
  }

  return null;
}

/** Geocode using structured address — prefers postal code and validates the match. */
export async function geocodeStructured(input: StructuredAddress): Promise<GeoPoint | null> {
  const zip = input.postalCode?.trim();

  if (zip) {
    const auto = await geocodePostalAutoDetect(zip, input.countryCode);
    if (auto) return auto;

    for (const query of buildGeocodeQueries(input)) {
      const hit = await searchGeocode(query, { postalCode: zip });
      if (hit) return hit;
    }
    return null;
  }

  for (const query of buildGeocodeQueries(input)) {
    const hit = await searchGeocode(query);
    if (hit) return hit;
  }
  return null;
}

/** Resolve a restaurant address to coordinates for weather APIs. */
export async function geocodeLocation(
  address: string | null | undefined,
  name: string,
  extras?: Partial<Omit<StructuredAddress, "name" | "address">>
): Promise<GeoPoint | null> {
  return geocodeStructured({
    name,
    address,
    postalCode: extras?.postalCode,
    city: extras?.city,
    stateProvince: extras?.stateProvince,
    countryCode: extras?.countryCode ?? "US",
  });
}
