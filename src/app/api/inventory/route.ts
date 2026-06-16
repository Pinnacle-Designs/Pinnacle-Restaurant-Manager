import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getLocationIdFromRequest } from "@/lib/location";
import {
  ensureInventoryStorageLayout,
  inferStorageZoneSlug,
} from "@/lib/walk-in/assign-inventory-zones";
import { syncRouteStepForItem } from "@/lib/walk-in/storage-zones";

export async function GET(request: NextRequest) {
  const locationId = await getLocationIdFromRequest(request);
  await ensureInventoryStorageLayout(locationId);
  const items = await prisma.inventoryItem.findMany({
    where: { locationId },
    include: { storageZone: { select: { id: true, name: true, slug: true } } },
    orderBy: { name: "asc" },
  });
  return NextResponse.json(items);
}

export async function POST(request: NextRequest) {
  const locationId = await getLocationIdFromRequest(request);
  await ensureInventoryStorageLayout(locationId);
  const body = await request.json();

  let storageZoneId: string | null = body.storageZoneId ?? null;
  if (!storageZoneId && body.name) {
    const slug = inferStorageZoneSlug({
      name: String(body.name),
      barcode: body.barcode ? String(body.barcode) : null,
      unit: String(body.unit ?? "lbs"),
    });
    const zone = await prisma.storageZone.findFirst({ where: { locationId, slug } });
    storageZoneId = zone?.id ?? null;
  }

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
      barcode: body.barcode ? String(body.barcode).replace(/\D/g, "") || null : null,
      storageZoneId,
    },
    include: { storageZone: { select: { id: true, name: true, slug: true } } },
  });

  if (item.storageZoneId) {
    await syncRouteStepForItem(item.id, item.storageZoneId);
  }

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
