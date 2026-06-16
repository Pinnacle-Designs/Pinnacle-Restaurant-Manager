import { prisma } from "@/lib/prisma";
import { bumpMenuRevision } from "./stock";
import { recordPosSyncDepletion } from "@/lib/integrations/pos-sync";

export type RecipeLineInput = {
  inventoryItemId: string;
  quantity: number;
};

export type RecipeLineDto = {
  id: string;
  inventoryItemId: string;
  quantity: number;
  sortOrder: number;
  inventoryItem: {
    id: string;
    name: string;
    unit: string;
    costPerUnit: number;
    yieldPct: number;
  };
  lineCost: number;
};

export function lineTheoreticalCost(
  quantity: number,
  costPerUnit: number,
  yieldPct: number
): number {
  const yieldFactor = Math.max(yieldPct, 1) / 100;
  return Math.round(quantity * costPerUnit * (1 / yieldFactor) * 100) / 100;
}

export function computeRecipeCostFromLines(
  lines: Array<{ quantity: number; inventoryItem: { costPerUnit: number; yieldPct: number } }>
): number {
  const total = lines.reduce(
    (sum, line) =>
      sum + lineTheoreticalCost(line.quantity, line.inventoryItem.costPerUnit, line.inventoryItem.yieldPct),
    0
  );
  return Math.round(total * 100) / 100;
}

export async function getMenuRecipeLines(menuItemId: string): Promise<RecipeLineDto[]> {
  const lines = await prisma.menuRecipeLine.findMany({
    where: { menuItemId },
    include: { inventoryItem: true },
    orderBy: { sortOrder: "asc" },
  });

  return lines.map((line) => ({
    id: line.id,
    inventoryItemId: line.inventoryItemId,
    quantity: line.quantity,
    sortOrder: line.sortOrder,
    inventoryItem: {
      id: line.inventoryItem.id,
      name: line.inventoryItem.name,
      unit: line.inventoryItem.unit,
      costPerUnit: line.inventoryItem.costPerUnit,
      yieldPct: line.inventoryItem.yieldPct,
    },
    lineCost: lineTheoreticalCost(
      line.quantity,
      line.inventoryItem.costPerUnit,
      line.inventoryItem.yieldPct
    ),
  }));
}

export async function syncMenuItemRecipeCost(menuItemId: string) {
  const lines = await prisma.menuRecipeLine.findMany({
    where: { menuItemId },
    include: { inventoryItem: true },
  });
  const recipeCost = computeRecipeCostFromLines(lines);
  return prisma.menuItem.update({
    where: { id: menuItemId },
    data: { recipeCost },
  });
}

export async function saveMenuRecipe(
  locationId: string,
  menuItemId: string,
  lines: RecipeLineInput[]
) {
  const menuItem = await prisma.menuItem.findFirst({
    where: { id: menuItemId, locationId },
  });
  if (!menuItem) throw new Error("Menu item not found");

  await prisma.menuRecipeLine.deleteMany({ where: { menuItemId } });

  if (lines.length) {
    await prisma.menuRecipeLine.createMany({
      data: lines.map((line, idx) => ({
        menuItemId,
        inventoryItemId: line.inventoryItemId,
        quantity: Math.max(0, line.quantity),
        sortOrder: idx,
      })),
    });
  }

  const updated = await syncMenuItemRecipeCost(menuItemId);
  await bumpMenuRevision(locationId);
  return updated;
}

/** Deduct exact recipe quantities from inventory when a menu item is sold/fired. */
export async function depleteRecipeForSale(
  locationId: string,
  menuItemId: string,
  platesSold: number
) {
  if (platesSold <= 0) return;

  const lines = await prisma.menuRecipeLine.findMany({
    where: { menuItemId },
    include: { inventoryItem: true },
  });

  if (!lines.length) return;

  for (const line of lines) {
    if (line.inventoryItem.locationId !== locationId) continue;
    const depleteQty = line.quantity * platesSold;
    const nextQty = Math.max(0, line.inventoryItem.quantity - depleteQty);
    await prisma.inventoryItem.update({
      where: { id: line.inventoryItemId },
      data: { quantity: nextQty },
    });
  }

  await recordPosSyncDepletion(locationId, menuItemId, platesSold, lines.length);
}
