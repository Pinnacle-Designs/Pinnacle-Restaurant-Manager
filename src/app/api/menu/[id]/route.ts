import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/api-auth";
import { getLocationIdFromRequest } from "@/lib/location";
import { onMenuChanged } from "@/lib/menu/on-menu-change";
import { normalizeSalesCategory } from "@/lib/menu/sales-categories";
import { tenantNotFoundResponse, tenantWhere } from "@/lib/tenant-resource";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requirePermission(request, "manage_menu");
  if (error) return error;

  const { id } = await params;
  const locationId = await getLocationIdFromRequest(request);
  const body = await request.json();

  const existing = await prisma.menuItem.findFirst({
    where: tenantWhere(id, locationId),
    select: { locationId: true },
  });
  if (!existing) {
    return tenantNotFoundResponse();
  }

  const item = await prisma.menuItem.update({
    where: tenantWhere(id, locationId),
    data: {
      name: body.name,
      description: body.description,
      price: body.price,
      category: body.category,
      available: body.available,
      imageUrl: body.imageUrl,
      kitchenStationId: body.kitchenStationId ?? undefined,
      defaultCourse: body.defaultCourse ?? undefined,
      isCombo: body.isCombo ?? undefined,
      salesCategory: body.salesCategory ? normalizeSalesCategory(body.salesCategory) : undefined,
    },
  });

  await onMenuChanged(locationId);

  return NextResponse.json(item);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requirePermission(request, "manage_menu");
  if (error) return error;

  const { id } = await params;
  const locationId = await getLocationIdFromRequest(request);

  const existing = await prisma.menuItem.findFirst({
    where: tenantWhere(id, locationId),
    select: { id: true },
  });
  if (!existing) {
    return tenantNotFoundResponse();
  }

  await prisma.menuItem.delete({ where: tenantWhere(id, locationId) });
  await onMenuChanged(locationId);

  return NextResponse.json({ success: true });
}
