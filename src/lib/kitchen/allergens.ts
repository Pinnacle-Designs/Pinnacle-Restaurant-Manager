export const MAJOR_ALLERGENS = [
  "gluten",
  "dairy",
  "eggs",
  "fish",
  "shellfish",
  "tree_nuts",
  "peanuts",
  "soy",
  "sesame",
] as const;

export type MajorAllergen = (typeof MAJOR_ALLERGENS)[number];

export const ALLERGEN_LABELS: Record<MajorAllergen, string> = {
  gluten: "Gluten / Wheat",
  dairy: "Dairy / Milk",
  eggs: "Eggs",
  fish: "Fish",
  shellfish: "Shellfish",
  tree_nuts: "Tree Nuts",
  peanuts: "Peanuts",
  soy: "Soy",
  sesame: "Sesame",
};

export function parseAllergens(json: string | null | undefined): string[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

export async function mergeMenuAllergens(menuItemId: string): Promise<string[]> {
  const { prisma } = await import("@/lib/prisma");
  const lines = await prisma.menuRecipeLine.findMany({
    where: { menuItemId },
    include: { inventoryItem: true },
  });

  const set = new Set<string>();
  for (const line of lines) {
    for (const a of parseAllergens(line.inventoryItem.allergens)) {
      set.add(a);
    }
  }
  return [...set].sort();
}

export interface AllergenAlert {
  menuItemId: string;
  menuItemName: string;
  ingredientId: string;
  ingredientName: string;
  newAllergens: string[];
  message: string;
}

export async function checkSubstitutionAllergens(
  locationId: string,
  inventoryItemId: string,
  previousAllergens: string[],
  newAllergens: string[]
): Promise<AllergenAlert[]> {
  const { prisma } = await import("@/lib/prisma");
  const added = newAllergens.filter((a) => !previousAllergens.includes(a));
  if (added.length === 0) return [];

  const item = await prisma.inventoryItem.findFirst({
    where: { id: inventoryItemId, locationId },
  });
  if (!item) return [];

  const recipeLinks = await prisma.menuRecipeLine.findMany({
    where: { inventoryItemId },
    include: { menuItem: true },
  });

  const alerts: AllergenAlert[] = [];

  for (const link of recipeLinks) {
    const menuAllergens = parseAllergens(link.menuItem.allergens);
    const newlyExposed = added.filter((a) => !menuAllergens.includes(a));
    if (newlyExposed.length === 0 && added.length > 0) {
      // Menu didn't have these before via this ingredient path
    }

    alerts.push({
      menuItemId: link.menuItemId,
      menuItemName: link.menuItem.name,
      ingredientId: inventoryItemId,
      ingredientName: item.name,
      newAllergens: added,
      message: `Vendor substitution on ${item.name} introduces ${added.map((a) => ALLERGEN_LABELS[a as MajorAllergen] ?? a).join(", ")} — affects ${link.menuItem.name}. Alert FOH.`,
    });

    const merged = [...new Set([...menuAllergens, ...added])];
    await prisma.menuItem.update({
      where: { id: link.menuItemId },
      data: { allergens: JSON.stringify(merged) },
    });

    await prisma.businessInsight.create({
      data: {
        locationId,
        title: `Allergen alert: ${link.menuItem.name}`,
        description: alerts[alerts.length - 1]!.message,
        category: "MENU",
        severity: "HIGH",
        actionable: "Update POS prompts and brief servers before service",
        dataSnapshot: JSON.stringify({
          menuItemId: link.menuItemId,
          allergens: added,
        }),
      },
    });
  }

  return alerts;
}

export function defaultAllergensForIngredient(name: string): string[] {
  const n = name.toLowerCase();
  const tags: string[] = [];
  if (n.includes("bun") || n.includes("macaroni") || n.includes("cornmeal") || n.includes("flour")) {
    tags.push("gluten");
  }
  if (
    n.includes("cheese") ||
    n.includes("butter") ||
    n.includes("milk") ||
    n.includes("cream") ||
    n.includes("ice cream")
  ) {
    tags.push("dairy");
  }
  if (n.includes("soy")) tags.push("soy");
  if (n.includes("peanut")) tags.push("peanuts");
  return tags;
}
