import { prisma } from "@/lib/prisma";
import { saveMenuRecipe } from "@/lib/menu/recipe";

export async function seedMenuRecipes(locationId: string) {
  const burger = await prisma.menuItem.findFirst({
    where: { locationId, name: "Classic Burger" },
  });
  const beef = await prisma.inventoryItem.findFirst({
    where: { locationId, name: { contains: "Flour" } },
  });
  const lettuce = await prisma.inventoryItem.findFirst({
    where: { locationId, name: { contains: "Romaine" } },
  });

  if (!burger) return;

  const lines: { inventoryItemId: string; quantity: number }[] = [];
  const patty = await prisma.inventoryItem.findFirst({
    where: { locationId, name: { contains: "Mozzarella" } },
  });
  if (patty) lines.push({ inventoryItemId: patty.id, quantity: 0.15 });
  if (lettuce) lines.push({ inventoryItemId: lettuce.id, quantity: 0.05 });
  if (beef) lines.push({ inventoryItemId: beef.id, quantity: 0.02 });

  if (lines.length) {
    await saveMenuRecipe(locationId, burger.id, lines);
  }
}
