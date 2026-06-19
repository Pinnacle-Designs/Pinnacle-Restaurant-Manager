import { prisma } from "@/lib/prisma";
import { bumpMenuRevision } from "./stock";
import { recordPosSyncDepletion } from "@/lib/integrations/pos-sync";
import {
  computeRecipeCostFromLines,
  lineTheoreticalCost,
  rawQuantityForSellable,
} from "./recipe-cost";

export { computeRecipeCostFromLines, lineTheoreticalCost, rawQuantityForSellable } from "./recipe-cost";

export type RecipeLineInput = {
  inventoryItemId: string;
  quantity: number;
};

export type RecipeComponentInput = {
  componentMenuItemId: string;
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

export type RecipeComponentDto = {
  id: string;
  componentMenuItemId: string;
  quantity: number;
  sortOrder: number;
  componentMenuItem: {
    id: string;
    name: string;
    recipeCost: number;
  };
  lineCost: number;
};

export type FlattenedRecipeLineDto = {
  inventoryItemId: string;
  quantity: number;
  inventoryItem: {
    id: string;
    name: string;
    unit: string;
    costPerUnit: number;
    yieldPct: number;
  };
  lineCost: number;
};

type InventorySnapshot = {
  id: string;
  name: string;
  unit: string;
  costPerUnit: number;
  yieldPct: number;
  locationId: string;
};

type RecipeGraph = {
  directLines: Map<string, Array<{ inventoryItemId: string; quantity: number; inventoryItem: InventorySnapshot }>>;
  components: Map<string, Array<{ componentMenuItemId: string; quantity: number }>>;
};

async function loadRecipeGraph(locationId: string, excludeParentId?: string): Promise<RecipeGraph> {
  const menuItems = await prisma.menuItem.findMany({
    where: { locationId },
    select: { id: true },
  });
  const menuIds = menuItems.map((m) => m.id);

  const [lines, components] = await Promise.all([
    prisma.menuRecipeLine.findMany({
      where: { menuItemId: { in: menuIds } },
      include: {
        inventoryItem: {
          select: {
            id: true,
            name: true,
            unit: true,
            costPerUnit: true,
            yieldPct: true,
            locationId: true,
          },
        },
      },
    }),
    prisma.menuRecipeComponent.findMany({
      where: {
        parentMenuItemId: {
          in: excludeParentId ? menuIds.filter((id) => id !== excludeParentId) : menuIds,
        },
      },
      select: { parentMenuItemId: true, componentMenuItemId: true, quantity: true },
    }),
  ]);

  const directLines = new Map<string, Array<{ inventoryItemId: string; quantity: number; inventoryItem: InventorySnapshot }>>();
  for (const line of lines) {
    if (line.inventoryItem.locationId !== locationId) continue;
    const bucket = directLines.get(line.menuItemId) ?? [];
    bucket.push({
      inventoryItemId: line.inventoryItemId,
      quantity: line.quantity,
      inventoryItem: line.inventoryItem,
    });
    directLines.set(line.menuItemId, bucket);
  }

  const componentMap = new Map<string, Array<{ componentMenuItemId: string; quantity: number }>>();
  for (const comp of components) {
    const bucket = componentMap.get(comp.parentMenuItemId) ?? [];
    bucket.push({
      componentMenuItemId: comp.componentMenuItemId,
      quantity: comp.quantity,
    });
    componentMap.set(comp.parentMenuItemId, bucket);
  }

  return { directLines, components: componentMap };
}

function mergeFlattenedLine(
  target: Map<string, FlattenedRecipeLineDto>,
  inventoryItemId: string,
  quantity: number,
  inventoryItem: InventorySnapshot
) {
  const existing = target.get(inventoryItemId);
  if (existing) {
    existing.quantity = Math.round((existing.quantity + quantity) * 1000) / 1000;
    existing.lineCost = lineTheoreticalCost(
      existing.quantity,
      existing.inventoryItem.costPerUnit,
      existing.inventoryItem.yieldPct
    );
    return;
  }
  target.set(inventoryItemId, {
    inventoryItemId,
    quantity,
    inventoryItem: {
      id: inventoryItem.id,
      name: inventoryItem.name,
      unit: inventoryItem.unit,
      costPerUnit: inventoryItem.costPerUnit,
      yieldPct: inventoryItem.yieldPct,
    },
    lineCost: lineTheoreticalCost(quantity, inventoryItem.costPerUnit, inventoryItem.yieldPct),
  });
}

export function flattenRecipeFromGraph(
  menuItemId: string,
  multiplier: number,
  graph: RecipeGraph,
  visiting: Set<string> = new Set()
): Map<string, FlattenedRecipeLineDto> {
  if (visiting.has(menuItemId)) {
    throw new Error("Circular recipe reference detected");
  }
  visiting.add(menuItemId);

  const result = new Map<string, FlattenedRecipeLineDto>();

  for (const line of graph.directLines.get(menuItemId) ?? []) {
    mergeFlattenedLine(
      result,
      line.inventoryItemId,
      line.quantity * multiplier,
      line.inventoryItem
    );
  }

  for (const comp of graph.components.get(menuItemId) ?? []) {
    const nested = flattenRecipeFromGraph(
      comp.componentMenuItemId,
      multiplier * comp.quantity,
      graph,
      visiting
    );
    for (const [inventoryItemId, nestedLine] of nested) {
      mergeFlattenedLine(
        result,
        inventoryItemId,
        nestedLine.quantity,
        nestedLine.inventoryItem as InventorySnapshot
      );
    }
  }

  visiting.delete(menuItemId);
  return result;
}

export async function getFlattenedRecipeLines(
  locationId: string,
  menuItemId: string,
  multiplier = 1
): Promise<FlattenedRecipeLineDto[]> {
  const graph = await loadRecipeGraph(locationId);
  const flat = flattenRecipeFromGraph(menuItemId, multiplier, graph);
  return Array.from(flat.values()).sort((a, b) =>
    a.inventoryItem.name.localeCompare(b.inventoryItem.name)
  );
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

export async function getMenuRecipeComponents(menuItemId: string): Promise<RecipeComponentDto[]> {
  const components = await prisma.menuRecipeComponent.findMany({
    where: { parentMenuItemId: menuItemId },
    include: {
      componentMenuItem: { select: { id: true, name: true, recipeCost: true } },
    },
    orderBy: { sortOrder: "asc" },
  });

  return components.map((comp) => ({
    id: comp.id,
    componentMenuItemId: comp.componentMenuItemId,
    quantity: comp.quantity,
    sortOrder: comp.sortOrder,
    componentMenuItem: comp.componentMenuItem,
    lineCost: Math.round(comp.componentMenuItem.recipeCost * comp.quantity * 100) / 100,
  }));
}

async function canReachComponent(
  locationId: string,
  fromMenuItemId: string,
  targetMenuItemId: string,
  excludeParentId: string
): Promise<boolean> {
  const graph = await loadRecipeGraph(locationId, excludeParentId);
  const visiting = new Set<string>();

  function visit(currentId: string): boolean {
    if (currentId === targetMenuItemId) return true;
    if (visiting.has(currentId)) return false;
    visiting.add(currentId);
    for (const comp of graph.components.get(currentId) ?? []) {
      if (visit(comp.componentMenuItemId)) return true;
    }
    return false;
  }

  return visit(fromMenuItemId);
}

async function validateRecipeComponents(
  locationId: string,
  parentMenuItemId: string,
  components: RecipeComponentInput[]
) {
  const validItems = await prisma.menuItem.findMany({
    where: { locationId },
    select: { id: true, name: true },
  });
  const validIds = new Set(validItems.map((i) => i.id));
  const nameById = Object.fromEntries(validItems.map((i) => [i.id, i.name]));

  for (const comp of components) {
    if (!validIds.has(comp.componentMenuItemId)) {
      throw new Error("Sub-recipe must be a menu item at this location");
    }
    if (comp.componentMenuItemId === parentMenuItemId) {
      throw new Error("A recipe cannot include itself");
    }
    if (
      await canReachComponent(
        locationId,
        comp.componentMenuItemId,
        parentMenuItemId,
        parentMenuItemId
      )
    ) {
      throw new Error(
        `Circular recipe: "${nameById[comp.componentMenuItemId]}" already depends on this item`
      );
    }
  }
}

export async function syncMenuItemRecipeCost(menuItemId: string) {
  const menuItem = await prisma.menuItem.findUnique({
    where: { id: menuItemId },
    select: { locationId: true },
  });
  if (!menuItem) throw new Error("Menu item not found");

  const flattened = await getFlattenedRecipeLines(menuItem.locationId, menuItemId);
  const recipeCost = computeRecipeCostFromLines(
    flattened.map((line) => ({ quantity: line.quantity, inventoryItem: line.inventoryItem }))
  );

  const updated = await prisma.menuItem.update({
    where: { id: menuItemId },
    data: { recipeCost, recipeCostUpdatedAt: new Date() },
  });

  const dependents = await prisma.menuRecipeComponent.findMany({
    where: { componentMenuItemId: menuItemId },
    select: { parentMenuItemId: true },
  });
  for (const dep of dependents) {
    await syncMenuItemRecipeCost(dep.parentMenuItemId);
  }

  return updated;
}

export async function saveMenuRecipe(
  locationId: string,
  menuItemId: string,
  lines: RecipeLineInput[],
  components: RecipeComponentInput[] = []
) {
  const menuItem = await prisma.menuItem.findFirst({
    where: { id: menuItemId, locationId },
  });
  if (!menuItem) throw new Error("Menu item not found");

  await validateRecipeComponents(locationId, menuItemId, components);

  await prisma.$transaction([
    prisma.menuRecipeLine.deleteMany({ where: { menuItemId } }),
    prisma.menuRecipeComponent.deleteMany({ where: { parentMenuItemId: menuItemId } }),
  ]);

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

  if (components.length) {
    await prisma.menuRecipeComponent.createMany({
      data: components.map((comp, idx) => ({
        parentMenuItemId: menuItemId,
        componentMenuItemId: comp.componentMenuItemId,
        quantity: Math.max(0, comp.quantity),
        sortOrder: idx,
      })),
    });
  }

  const updated = await syncMenuItemRecipeCost(menuItemId);
  await bumpMenuRevision(locationId);
  return updated;
}

/** Deduct exact recipe quantities from inventory when a menu item is sold/fired (includes sub-recipes). */
export async function depleteRecipeForSale(
  locationId: string,
  menuItemId: string,
  platesSold: number
) {
  if (platesSold <= 0) return;

  let flattened: FlattenedRecipeLineDto[];
  try {
    flattened = await getFlattenedRecipeLines(locationId, menuItemId, platesSold);
  } catch {
    return;
  }

  if (!flattened.length) return;

  for (const line of flattened) {
    const inv = await prisma.inventoryItem.findUnique({
      where: { id: line.inventoryItemId },
      select: { id: true, quantity: true, locationId: true },
    });
    if (!inv || inv.locationId !== locationId) continue;
    const nextQty = Math.max(0, inv.quantity - line.quantity);
    await prisma.inventoryItem.update({
      where: { id: line.inventoryItemId },
      data: { quantity: nextQty },
    });
  }

  await recordPosSyncDepletion(locationId, menuItemId, platesSold, flattened.length);
}
