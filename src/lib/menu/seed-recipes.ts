import { prisma } from "@/lib/prisma";
import { saveMenuRecipe } from "@/lib/menu/recipe";
import { BBQ_INVENTORY_CATALOG, BBQ_MENU_RECIPES } from "@/lib/menu/bbq-catalog";

/** Upsert every catalog ingredient into inventory (for fresh and existing locations). */
export async function ensureLocationInventory(locationId: string) {
  for (const row of BBQ_INVENTORY_CATALOG) {
    const existing = await prisma.inventoryItem.findFirst({
      where: { locationId, name: row.name },
    });
    if (existing) {
      if (!existing.barcode && row.barcode) {
        await prisma.inventoryItem.update({
          where: { id: existing.id },
          data: { barcode: row.barcode },
        });
      }
      continue;
    }
    await prisma.inventoryItem.create({
      data: {
        locationId,
        name: row.name,
        quantity: row.quantity,
        unit: row.unit,
        minQuantity: row.minQuantity,
        costPerUnit: row.costPerUnit,
        previousCostPerUnit: row.previousCostPerUnit,
        portionSize: row.portionSize,
        yieldPct: row.yieldPct ?? 100,
        supplier: row.supplier,
        barcode: row.barcode ?? null,
      },
    });
  }
}

async function inventoryMap(locationId: string) {
  const items = await prisma.inventoryItem.findMany({ where: { locationId } });
  return Object.fromEntries(items.map((i) => [i.name, i.id]));
}

/** Link each menu item to inventory ingredients and sync recipeCost on the menu item. */
export async function seedMenuRecipes(locationId: string) {
  await ensureLocationInventory(locationId);
  const inv = await inventoryMap(locationId);

  const menuItems = await prisma.menuItem.findMany({ where: { locationId } });

  for (const item of menuItems) {
    const spec = BBQ_MENU_RECIPES[item.name];
    if (!spec?.length) continue;

    const lines = spec
      .map((row) => {
        const inventoryItemId = inv[row.ingredient];
        if (!inventoryItemId) {
          console.warn(`[seed-recipes] Missing inventory "${row.ingredient}" for "${item.name}"`);
          return null;
        }
        return { inventoryItemId, quantity: row.quantity };
      })
      .filter((line): line is { inventoryItemId: string; quantity: number } => line !== null);

    if (lines.length === 0) continue;
    await saveMenuRecipe(locationId, item.id, lines);
  }
}
