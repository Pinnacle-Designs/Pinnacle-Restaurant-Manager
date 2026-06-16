import { prisma } from "@/lib/prisma";
import { convertQuantity, parseAlternateUnits } from "./unit-convert";

export async function logWaste(
  locationId: string,
  data: {
    inventoryItemId?: string;
    itemName: string;
    quantity: number;
    unit: string;
    reason: string;
    countSessionId?: string;
    lotId?: string;
    wasteCategory?: string;
    recordedByStaffId?: string;
    shiftId?: string;
  }
) {
  let cost = 0;
  let itemName = data.itemName;
  let unit = data.unit;
  let qty = data.quantity;

  if (data.inventoryItemId) {
    const item = await prisma.inventoryItem.findFirst({
      where: { id: data.inventoryItemId, locationId },
    });
    if (item) {
      itemName = item.name;
      const alternates = parseAlternateUnits(item.alternateUnits);
      qty = convertQuantity(data.quantity, data.unit, item.unit, alternates);
      unit = item.unit;
      cost = qty * item.costPerUnit;

      await prisma.inventoryItem.update({
        where: { id: item.id },
        data: { quantity: Math.max(0, item.quantity - qty) },
      });

      if (data.lotId) {
        const lot = await prisma.inventoryLot.findFirst({
          where: { id: data.lotId, locationId },
        });
        if (lot) {
          await prisma.inventoryLot.update({
            where: { id: lot.id },
            data: { quantity: Math.max(0, lot.quantity - qty) },
          });
        }
      }
    }
  }

  const waste = await prisma.inventoryWaste.create({
    data: {
      locationId,
      inventoryItemId: data.inventoryItemId ?? null,
      itemName,
      quantity: qty,
      unit,
      cost,
      reason: data.reason,
      countSessionId: data.countSessionId ?? null,
      lotId: data.lotId ?? null,
      wasteCategory: data.wasteCategory ?? null,
      recordedByStaffId: data.recordedByStaffId ?? null,
      shiftId: data.shiftId ?? null,
    },
  });

  await prisma.activityLog.create({
    data: {
      locationId,
      action: "WASTE",
      entity: "inventory_waste",
      entityId: waste.id,
      details: `Waste: ${qty} ${unit} ${itemName} — ${data.reason}`,
    },
  });

  return waste;
}
