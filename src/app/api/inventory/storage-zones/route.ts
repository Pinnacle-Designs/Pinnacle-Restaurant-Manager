import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getLocationIdFromRequest } from "@/lib/location";
import { requirePermission } from "@/lib/api-auth";
import { ensureDefaultStorageZones, uniqueZoneSlug } from "@/lib/walk-in/storage-zones";
import { ensureInventoryStorageLayout } from "@/lib/walk-in/assign-inventory-zones";

export async function GET(request: NextRequest) {
  const { error } = await requirePermission(request, "manage_inventory");
  if (error) return error;

  const locationId = await getLocationIdFromRequest(request);
  await ensureInventoryStorageLayout(locationId);

  const zones = await prisma.storageZone.findMany({
    where: { locationId },
    include: {
      _count: { select: { items: true, routeSteps: true } },
    },
    orderBy: { sortOrder: "asc" },
  });

  return NextResponse.json(zones);
}

export async function POST(request: NextRequest) {
  const { error } = await requirePermission(request, "manage_inventory");
  if (error) return error;

  const locationId = await getLocationIdFromRequest(request);
  const body = await request.json();
  const name = String(body.name ?? "").trim();
  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const maxOrder = await prisma.storageZone.aggregate({
    where: { locationId },
    _max: { sortOrder: true },
  });

  const slug = await uniqueZoneSlug(locationId, name);
  const zone = await prisma.storageZone.create({
    data: {
      locationId,
      name,
      slug,
      sortOrder: body.sortOrder ?? (maxOrder._max.sortOrder ?? -1) + 1,
    },
    include: { _count: { select: { items: true, routeSteps: true } } },
  });

  await prisma.activityLog.create({
    data: {
      locationId,
      action: "CREATE",
      entity: "storage_zone",
      entityId: zone.id,
      details: `Added storage zone: ${zone.name}`,
    },
  });

  return NextResponse.json(zone);
}
