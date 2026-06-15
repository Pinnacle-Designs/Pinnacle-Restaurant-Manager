import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/api-auth";
import {
  computeRecipeCostFromLines,
  getMenuRecipeLines,
  saveMenuRecipe,
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
    select: { id: true, name: true, price: true, recipeCost: true },
  });
  if (!menuItem) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const lines = await getMenuRecipeLines(id);
  const theoreticalCost = computeRecipeCostFromLines(
    lines.map((l) => ({ quantity: l.quantity, inventoryItem: l.inventoryItem }))
  );

  return NextResponse.json({
    menuItem,
    lines,
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

  const updated = await saveMenuRecipe(menuItem.locationId, id, lines);
  const recipe = await getMenuRecipeLines(id);

  return NextResponse.json({
    menuItem: updated,
    lines: recipe,
  });
}
