import { addDays } from "date-fns";
import { prisma } from "@/lib/prisma";
import { defaultAlternatesForUnit } from "./unit-convert";
import { ensureInventoryStorageLayout } from "./assign-inventory-zones";

export async function seedWalkInSample(locationId: string) {
  await ensureInventoryStorageLayout(locationId);

  const routeCount = await prisma.countRouteStep.count({
    where: { zone: { locationId } },
  });
  if (routeCount > 0) {
    await seedLotsOnly(locationId);
    return;
  }

  const zones = await prisma.storageZone.findMany({
    where: { locationId },
    orderBy: { sortOrder: "asc" },
  });

  const walkIn = zones.find((z) => z.slug === "walk-in");
  const dry = zones.find((z) => z.slug === "dry");
  if (!walkIn || !dry) return;

  const inventory = await prisma.inventoryItem.findMany({
    where: { locationId },
    orderBy: { name: "asc" },
  });

  for (const item of inventory) {
    const alternates = defaultAlternatesForUnit(item.unit);
    await prisma.inventoryItem.update({
      where: { id: item.id },
      data: {
        alternateUnits: alternates.length ? JSON.stringify(alternates) : null,
        countByWeight: ["lbs", "oz", "kg"].includes(item.unit),
      },
    });
  }

  await seedLotsOnly(locationId);
}

async function seedLotsOnly(locationId: string) {
  const existing = await prisma.inventoryLot.count({ where: { locationId } });
  if (existing > 0) return;

  const zones = await prisma.storageZone.findMany({ where: { locationId } });
  const walkIn = zones.find((z) => z.slug === "walk-in");
  const dry = zones.find((z) => z.slug === "dry");
  if (!walkIn || !dry) return;

  const inventory = await prisma.inventoryItem.findMany({
    where: { locationId },
    orderBy: { name: "asc" },
  });

  const now = new Date();
  for (const [idx, item] of inventory.slice(0, 6).entries()) {
    await prisma.inventoryLot.create({
      data: {
        locationId,
        inventoryItemId: item.id,
        zoneId: idx % 2 === 0 ? walkIn.id : dry.id,
        lotNumber: `LOT-${1000 + idx}`,
        quantity: Math.max(item.quantity * 0.4, 1),
        unit: item.unit,
        receivedAt: addDays(now, -7 - idx),
        expiresAt: addDays(now, idx === 0 ? -1 : idx === 1 ? 2 : 14),
      },
    });
    if (idx < 3) {
      await prisma.inventoryLot.create({
        data: {
          locationId,
          inventoryItemId: item.id,
          zoneId: walkIn.id,
          lotNumber: `LOT-${2000 + idx}`,
          quantity: Math.max(item.quantity * 0.3, 1),
          unit: item.unit,
          receivedAt: addDays(now, -2),
          expiresAt: addDays(now, 10),
        },
      });
    }
  }
}
