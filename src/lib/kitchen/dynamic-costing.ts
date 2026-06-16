import { prisma } from "@/lib/prisma";
import {
  computeRecipeCostFromLines,
  syncMenuItemRecipeCost,
  lineTheoreticalCost,
} from "@/lib/menu/recipe";
import { parseAllergens, mergeMenuAllergens } from "./allergens";

export interface MenuCostRow {
  id: string;
  name: string;
  category: string;
  price: number;
  recipeCost: number;
  margin: number;
  marginPct: number;
  allergens: string[];
  lines: {
    ingredient: string;
    rawQty: number;
    unit: string;
    yieldPct: number;
    sellableQty: number;
    lineCost: number;
    costPerUnit: number;
  }[];
}

/** Recalculate recipeCost for every menu item that uses a given ingredient. */
export async function recalculateRecipesForIngredient(inventoryItemId: string) {
  const recipeLinks = await prisma.menuRecipeLine.findMany({
    where: { inventoryItemId },
    select: { menuItemId: true },
  });
  const menuItemIds = [...new Set(recipeLinks.map((r) => r.menuItemId))];
  const updated = [];

  for (const menuItemId of menuItemIds) {
    const item = await syncMenuItemRecipeCost(menuItemId);
    const allergens = await mergeMenuAllergens(menuItemId);
    await prisma.menuItem.update({
      where: { id: menuItemId },
      data: {
        allergens: JSON.stringify(allergens),
        recipeCostUpdatedAt: new Date(),
      },
    });
    updated.push(item);
  }

  return updated;
}

/** Recalculate all menu item costs for a location. */
export async function recalculateAllRecipeCosts(locationId: string) {
  const menuItems = await prisma.menuItem.findMany({
    where: { locationId },
    include: {
      recipeLines: { include: { inventoryItem: true } },
    },
  });

  const results: MenuCostRow[] = [];

  for (const item of menuItems) {
    const recipeCost = computeRecipeCostFromLines(item.recipeLines);
    const allergens = await mergeMenuAllergens(item.id);

    await prisma.menuItem.update({
      where: { id: item.id },
      data: {
        recipeCost,
        allergens: JSON.stringify(allergens),
        recipeCostUpdatedAt: new Date(),
      },
    });

    results.push(buildCostRow(item, recipeCost, allergens));
  }

  return results;
}

function buildCostRow(
  item: {
    id: string;
    name: string;
    category: string;
    price: number;
    recipeLines: Array<{
      quantity: number;
      inventoryItem: {
        name: string;
        unit: string;
        costPerUnit: number;
        yieldPct: number;
      };
    }>;
  },
  recipeCost: number,
  allergens: string[]
): MenuCostRow {
  const margin = item.price - recipeCost;
  return {
    id: item.id,
    name: item.name,
    category: item.category,
    price: item.price,
    recipeCost,
    margin,
    marginPct: item.price > 0 ? (margin / item.price) * 100 : 0,
    allergens,
    lines: item.recipeLines.map((line) => {
      const yieldPct = line.inventoryItem.yieldPct ?? 100;
      const sellableQty = line.quantity;
      const rawNeeded = sellableQty / (yieldPct / 100);
      return {
        ingredient: line.inventoryItem.name,
        rawQty: Math.round(rawNeeded * 100) / 100,
        unit: line.inventoryItem.unit,
        yieldPct,
        sellableQty: line.quantity,
        lineCost: lineTheoreticalCost(
          line.quantity,
          line.inventoryItem.costPerUnit,
          yieldPct
        ),
        costPerUnit: line.inventoryItem.costPerUnit,
      };
    }),
  };
}

export async function getKitchenCostingDashboard(locationId: string): Promise<MenuCostRow[]> {
  const menuItems = await prisma.menuItem.findMany({
    where: { locationId, available: true },
    include: {
      recipeLines: { include: { inventoryItem: true } },
    },
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });

  return menuItems.map((item) => {
    const recipeCost = computeRecipeCostFromLines(item.recipeLines);
    const allergens = parseAllergens(item.allergens);
    return buildCostRow(item, recipeCost, allergens);
  });
}
