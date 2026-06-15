import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getLocationIdFromRequest } from "@/lib/location";
import { onMenuChanged } from "@/lib/menu/on-menu-change";
import { normalizeSalesCategory, defaultSalesCategoryForMenuCategory } from "@/lib/menu/sales-categories";

export async function GET(request: NextRequest) {
  const locationId = await getLocationIdFromRequest(request);
  const items = await prisma.menuItem.findMany({
    where: { locationId },
    orderBy: { category: "asc" },
  });
  return NextResponse.json(items);
}

export async function POST(request: NextRequest) {
  const locationId = await getLocationIdFromRequest(request);
  const body = await request.json();
  const salesCategory = body.salesCategory
    ? normalizeSalesCategory(body.salesCategory)
    : defaultSalesCategoryForMenuCategory(body.category ?? "Entrees");

  const item = await prisma.menuItem.create({
    data: {
      locationId,
      name: body.name,
      description: body.description,
      price: body.price,
      category: body.category,
      salesCategory,
      available: body.available ?? true,
      imageUrl: body.imageUrl,
    },
  });

  await prisma.activityLog.create({
    data: {
      locationId,
      action: "CREATE",
      entity: "menuItem",
      entityId: item.id,
      details: `Added menu item: ${item.name}`,
    },
  });

  await onMenuChanged(locationId);

  return NextResponse.json(item);
}
