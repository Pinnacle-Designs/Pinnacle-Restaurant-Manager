import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/api-auth";
import { getLocationIdFromRequest } from "@/lib/location";
import { syncRouteStepForItem } from "@/lib/walk-in/storage-zones";
import { tenantNotFoundResponse, tenantWhere } from "@/lib/tenant-resource";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requirePermission(request, "manage_inventory");
  if (error) return error;

  const { id } = await params;
  const locationId = await getLocationIdFromRequest(request);
  const body = await request.json();

  const existing = await prisma.inventoryItem.findFirst({
    where: tenantWhere(id, locationId),
  });
  if (!existing) {
    return tenantNotFoundResponse();
  }

  const newCost = body.costPerUnit;
  const costChanged =
    newCost !== undefined && newCost !== existing.costPerUnit;
  const zoneChanged =
    body.storageZoneId !== undefined && body.storageZoneId !== existing.storageZoneId;

  const item = await prisma.inventoryItem.update({
    where: tenantWhere(id, locationId),
    data: {
      name: body.name,
      quantity: body.quantity,
      unit: body.unit,
      minQuantity: body.minQuantity,
      costPerUnit: body.costPerUnit,
      previousCostPerUnit: costChanged ? existing.costPerUnit : body.previousCostPerUnit,
      portionSize: body.portionSize,
      yieldPct: body.yieldPct,
      supplier: body.supplier,
      imageUrl: body.imageUrl,
      storageZoneId:
        body.storageZoneId !== undefined ? body.storageZoneId || null : undefined,
      barcode:
        body.barcode !== undefined
          ? body.barcode
            ? String(body.barcode).replace(/\D/g, "")
            : null
          : undefined,
    },
    include: { storageZone: { select: { id: true, name: true, slug: true } } },
  });

  if (zoneChanged) {
    await syncRouteStepForItem(item.id, item.storageZoneId);
  }

  if (costChanged) {
    const { recalculateRecipesForIngredient } = await import("@/lib/kitchen/dynamic-costing");
    await recalculateRecipesForIngredient(id);
  }

  return NextResponse.json(item);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requirePermission(request, "manage_inventory");
  if (error) return error;

  const { id } = await params;
  const locationId = await getLocationIdFromRequest(request);
  const existing = await prisma.inventoryItem.findFirst({
    where: tenantWhere(id, locationId),
    select: { id: true },
  });
  if (!existing) {
    return tenantNotFoundResponse();
  }

  await prisma.inventoryItem.delete({ where: tenantWhere(id, locationId) });
  return NextResponse.json({ success: true });
}
