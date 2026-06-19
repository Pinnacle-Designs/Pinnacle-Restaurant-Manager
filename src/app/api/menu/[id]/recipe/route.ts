import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/api-auth";
import {
  computeRecipeCostFromLines,
  getFlattenedRecipeLines,
  getMenuRecipeComponents,
  getMenuRecipeLines,
  saveMenuRecipe,
  type RecipeComponentInput,
  type RecipeLineInput,
} from "@/lib/menu/recipe";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requirePermission(_request, "manage_menu");
  if (error) return error;

  const { id } = await params;
  const menuItem = await prisma.menuItem.findUnique({
    where: { id },
    select: { id: true, name: true, price: true, recipeCost: true, locationId: true },
  });
  if (!menuItem) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const [lines, components, flattenedLines] = await Promise.all([
    getMenuRecipeLines(id),
    getMenuRecipeComponents(id),
    getFlattenedRecipeLines(menuItem.locationId, id),
  ]);

  const theoreticalCost = computeRecipeCostFromLines(
    flattenedLines.map((l) => ({ quantity: l.quantity, inventoryItem: l.inventoryItem }))
  );

  return NextResponse.json({
    menuItem,
    lines,
    components,
    flattenedLines,
    theoreticalCost,
    margin: menuItem.price - theoreticalCost,
    marginPct: menuItem.price > 0 ? ((menuItem.price - theoreticalCost) / menuItem.price) * 100 : 0,
  });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requirePermission(request, "manage_menu");
  if (error) return error;

  const { id } = await params;
  const body = await request.json();
  const menuItem = await prisma.menuItem.findUnique({
    where: { id },
    select: { locationId: true },
  });
  if (!menuItem) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const lines: RecipeLineInput[] = Array.isArray(body.lines)
    ? body.lines
        .map((l: { inventoryItemId?: string; quantity?: number }) => ({
          inventoryItemId: String(l.inventoryItemId ?? ""),
          quantity: Number(l.quantity ?? 0),
        }))
        .filter((l: RecipeLineInput) => l.inventoryItemId && l.quantity > 0)
    : [];

  const components: RecipeComponentInput[] = Array.isArray(body.components)
    ? body.components
        .map((c: { componentMenuItemId?: string; quantity?: number }) => ({
          componentMenuItemId: String(c.componentMenuItemId ?? ""),
          quantity: Number(c.quantity ?? 0),
        }))
        .filter((c: RecipeComponentInput) => c.componentMenuItemId && c.quantity > 0)
    : [];

  try {
    const updated = await saveMenuRecipe(menuItem.locationId, id, lines, components);
    const [recipe, recipeComponents, flattenedLines] = await Promise.all([
      getMenuRecipeLines(id),
      getMenuRecipeComponents(id),
      getFlattenedRecipeLines(menuItem.locationId, id),
    ]);

    return NextResponse.json({
      menuItem: updated,
      lines: recipe,
      components: recipeComponents,
      flattenedLines,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not save recipe";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
