import { NextRequest, NextResponse } from "next/server";
import { getLocationIdFromRequest } from "@/lib/location";
import { requirePermission } from "@/lib/api-auth";
import { bumpMenuRevision } from "@/lib/menu/stock";
import { prisma } from "@/lib/prisma";
import { tenantNotFoundResponse, tenantWhere } from "@/lib/tenant-resource";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requirePermission(request, "manage_menu");
  if (error) return error;

  const locationId = await getLocationIdFromRequest(request);
  const { id } = await params;
  const body = await request.json();

  const existing = await prisma.menuScheduleRule.findFirst({
    where: tenantWhere(id, locationId),
    select: { id: true },
  });
  if (!existing) {
    return tenantNotFoundResponse();
  }

  const rule = await prisma.menuScheduleRule.update({
    where: tenantWhere(id, locationId),
    data: {
      name: body.name,
      mode: body.mode,
      categories: body.categories,
      daysOfWeek: body.daysOfWeek,
      startTime: body.startTime,
      endTime: body.endTime,
      priceMultiplier: body.priceMultiplier,
      active: body.active,
      sortOrder: body.sortOrder,
    },
  });
  await bumpMenuRevision(locationId);
  return NextResponse.json(rule);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requirePermission(_request, "manage_menu");
  if (error) return error;

  const locationId = await getLocationIdFromRequest(_request);
  const { id } = await params;

  const existing = await prisma.menuScheduleRule.findFirst({
    where: tenantWhere(id, locationId),
    select: { id: true },
  });
  if (!existing) {
    return tenantNotFoundResponse();
  }

  await prisma.menuScheduleRule.delete({ where: tenantWhere(id, locationId) });
  await bumpMenuRevision(locationId);
  return NextResponse.json({ ok: true });
}
