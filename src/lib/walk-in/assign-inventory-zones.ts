import { prisma } from "@/lib/prisma";
import { ensureDefaultStorageZones, syncRouteStepForItem } from "./storage-zones";

type ZoneSlug = "walk-in" | "dry" | "freezer" | "bar";

/** Infer which storage zone an inventory SKU belongs in. */
export function inferStorageZoneSlug(item: {
  name: string;
  barcode: string | null;
  unit: string;
}): ZoneSlug {
  const name = item.name.toLowerCase();
  const bc = (item.barcode ?? "").toUpperCase();

  if (bc.startsWith("BAR-") || item.unit === "kegs") return "bar";
  if (
    name.includes("ice cream") ||
    name.includes("frozen") ||
    (item.unit === "gal" && name.includes("ice"))
  ) {
    return "freezer";
  }

  if (
    bc.startsWith("DRY-") ||
    bc.startsWith("CAN-") ||
    bc.startsWith("SAUC-") ||
    bc.startsWith("BKRY-") ||
    bc.startsWith("BEV-") ||
    bc.startsWith("OPS-") ||
    item.unit === "cans" ||
    item.unit === "bags" ||
    /macaroni|cornmeal|rub|sauce|honey|beans|mix|buns|concentrate|cobbler|wood|pickle|dressing/.test(
      name
    )
  ) {
    return "dry";
  }

  if (
    bc.startsWith("MEAT-") ||
    bc.startsWith("DAIRY-") ||
    bc.startsWith("PROD-") ||
    item.unit === "racks" ||
    item.unit === "heads" ||
    (item.unit === "lbs" && !name.includes("wood"))
  ) {
    return "walk-in";
  }

  if (item.unit === "bottles") return "bar";
  if (item.unit === "each") return "walk-in";
  if (item.unit === "gal") return "walk-in";

  return "dry";
}

/** Create default zones and auto-assign unzoned inventory items. */
export async function ensureInventoryStorageLayout(locationId: string) {
  await ensureDefaultStorageZones(locationId);

  const zones = await prisma.storageZone.findMany({
    where: { locationId },
    select: { id: true, slug: true },
  });
  const zoneBySlug = new Map(zones.map((z) => [z.slug, z.id]));

  const unassigned = await prisma.inventoryItem.findMany({
    where: { locationId, storageZoneId: null },
    select: { id: true, name: true, barcode: true, unit: true },
  });

  for (const item of unassigned) {
    const slug = inferStorageZoneSlug(item);
    const zoneId = zoneBySlug.get(slug);
    if (!zoneId) continue;

    await prisma.inventoryItem.update({
      where: { id: item.id },
      data: { storageZoneId: zoneId },
    });
    await syncRouteStepForItem(item.id, zoneId);
  }
}
