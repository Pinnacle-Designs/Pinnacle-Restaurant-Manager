import { prisma } from "@/lib/prisma";
import { defaultAllergensForIngredient } from "./allergens";

const INGREDIENT_ALLERGENS: Record<string, string[]> = {
  "Brioche buns": ["gluten", "eggs"],
  "Elbow macaroni": ["gluten"],
  "Sharp cheddar": ["dairy"],
  "Cream cheese": ["dairy"],
  "Unsalted butter": ["dairy"],
  "Whole milk": ["dairy"],
  "Vanilla ice cream": ["dairy", "eggs"],
  "Cornmeal mix": ["gluten"],
};

export async function seedKitchenSample(locationId: string) {
  const inventory = await prisma.inventoryItem.findMany({ where: { locationId } });

  for (const item of inventory) {
    const allergens =
      INGREDIENT_ALLERGENS[item.name] ?? defaultAllergensForIngredient(item.name);
    if (allergens.length > 0) {
      await prisma.inventoryItem.update({
        where: { id: item.id },
        data: { allergens: JSON.stringify(allergens) },
      });
    }
  }

  const { recalculateAllRecipeCosts } = await import("./dynamic-costing");
  await recalculateAllRecipeCosts(locationId);
}
