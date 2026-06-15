import { prisma } from "@/lib/prisma";

export const DEFAULT_KITCHEN_STATIONS = [
  { name: "Grill", slug: "grill", outputKind: "KDS", color: "#ea580c", sortOrder: 0 },
  { name: "Fry", slug: "fry", outputKind: "KDS", color: "#ca8a04", sortOrder: 1 },
  { name: "Cold / Salad", slug: "cold", outputKind: "KDS", color: "#16a34a", sortOrder: 2 },
  { name: "Pizza", slug: "pizza", outputKind: "KDS", color: "#dc2626", sortOrder: 3 },
  { name: "Service Bar", slug: "service-bar", outputKind: "PRINTER", color: "#7c3aed", sortOrder: 4 },
  { name: "Expo", slug: "expo", outputKind: "KDS", color: "#0ea5e9", sortOrder: 5 },
] as const;

export type KitchenStationDto = {
  id: string;
  name: string;
  slug: string;
  outputKind: string;
  sortOrder: number;
  active: boolean;
  color: string | null;
};

export async function ensureKitchenStations(locationId: string): Promise<KitchenStationDto[]> {
  const existing = await prisma.kitchenStation.findMany({
    where: { locationId },
    select: { slug: true },
  });
  const have = new Set(existing.map((s) => s.slug));
  const missing = DEFAULT_KITCHEN_STATIONS.filter((s) => !have.has(s.slug));

  if (missing.length) {
    await prisma.kitchenStation.createMany({
      data: missing.map((s) => ({ locationId, ...s })),
    });
  }

  return prisma.kitchenStation.findMany({
    where: { locationId, active: true },
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      name: true,
      slug: true,
      outputKind: true,
      sortOrder: true,
      active: true,
      color: true,
    },
  });
}

export async function getKitchenStationMap(locationId: string) {
  const stations = await ensureKitchenStations(locationId);
  return Object.fromEntries(stations.map((s) => [s.id, s]));
}

/** Category → default station slug heuristics when menu item has no explicit station. */
const CATEGORY_STATION_SLUG: Record<string, string> = {
  Entrees: "grill",
  Burgers: "grill",
  Pizza: "pizza",
  Salads: "cold",
  Appetizers: "cold",
  Sides: "fry",
  Desserts: "cold",
  Beer: "service-bar",
  Cocktails: "service-bar",
  Beverages: "service-bar",
};

export function defaultStationSlugForCategory(category: string): string {
  return CATEGORY_STATION_SLUG[category] ?? "expo";
}
