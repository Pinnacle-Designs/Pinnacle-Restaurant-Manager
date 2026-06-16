import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getLocationIdFromRequest } from "@/lib/location";
import { requirePermission } from "@/lib/api-auth";
import {
  checkSubstitutionAllergens,
  mergeMenuAllergens,
  parseAllergens,
} from "@/lib/kitchen/allergens";

export async function GET(request: NextRequest) {
  const { error } = await requirePermission(request, "manage_menu");
  if (error) return error;

  const locationId = await getLocationIdFromRequest(request);
  const items = await prisma.menuItem.findMany({
    where: { locationId, available: true },
    select: { id: true, name: true, category: true, allergens: true },
    orderBy: { name: "asc" },
  });

  return NextResponse.json({
    items: items.map((i) => ({
      ...i,
      allergens: parseAllergens(i.allergens),
    })),
  });
}

export async function PATCH(request: NextRequest) {
  const { error } = await requirePermission(request, "manage_menu");
  if (error) return error;

  const locationId = await getLocationIdFromRequest(request);
  const body = await request.json();
  const inventoryItemId = body.inventoryItemId as string;
  const newAllergens = (body.allergens as string[]) ?? [];

  const item = await prisma.inventoryItem.findFirst({
    where: { id: inventoryItemId, locationId },
  });
  if (!item) {
    return NextResponse.json({ error: "Ingredient not found" }, { status: 404 });
  }

  const previousAllergens = parseAllergens(item.allergens);
  await prisma.inventoryItem.update({
    where: { id: item.id },
    data: { allergens: JSON.stringify(newAllergens) },
  });

  const alerts = await checkSubstitutionAllergens(
    locationId,
    inventoryItemId,
    previousAllergens,
    newAllergens
  );

  const affectedMenuIds = [...new Set(alerts.map((a) => a.menuItemId))];
  for (const menuItemId of affectedMenuIds) {
    const merged = await mergeMenuAllergens(menuItemId);
    await prisma.menuItem.update({
      where: { id: menuItemId },
      data: { allergens: JSON.stringify(merged) },
    });
  }

  return NextResponse.json({ alerts, updated: item.id });
}
