import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getLocationIdFromRequest } from "@/lib/location";

export async function GET(request: NextRequest) {
  const locationId = await getLocationIdFromRequest(request);
  const items = await prisma.inventoryItem.findMany({
    where: { locationId },
    orderBy: { name: "asc" },
  });
  return NextResponse.json(items);
}

export async function POST(request: NextRequest) {
  const locationId = await getLocationIdFromRequest(request);
  const body = await request.json();
  const item = await prisma.inventoryItem.create({
    data: {
      locationId,
      name: body.name,
      quantity: body.quantity,
      unit: body.unit,
      minQuantity: body.minQuantity ?? 0,
      costPerUnit: body.costPerUnit ?? 0,
      portionSize: body.portionSize ?? null,
      yieldPct: body.yieldPct ?? 100,
      supplier: body.supplier,
      imageUrl: body.imageUrl,
    },
  });

  await prisma.activityLog.create({
    data: {
      locationId,
      action: "CREATE",
      entity: "inventory",
      entityId: item.id,
      details: `Added inventory: ${item.name}`,
    },
  });

  return NextResponse.json(item);
}
