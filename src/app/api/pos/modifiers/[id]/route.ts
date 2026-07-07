import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/api-auth";
import { getLocationIdFromRequest } from "@/lib/location";
import { tenantNotFoundResponse, tenantWhere } from "@/lib/tenant-resource";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requirePermission(request, "manage_menu");
  if (error) return error;

  const { id } = await params;
  const locationId = await getLocationIdFromRequest(request);
  const existing = await prisma.modifierGroup.findFirst({
    where: tenantWhere(id, locationId),
    select: { id: true },
  });
  if (!existing) {
    return tenantNotFoundResponse();
  }

  await prisma.modifierGroup.delete({ where: tenantWhere(id, locationId) });
  return NextResponse.json({ ok: true });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requirePermission(request, "manage_menu");
  if (error) return error;

  const { id } = await params;
  const locationId = await getLocationIdFromRequest(request);
  const body = await request.json();

  const existing = await prisma.modifierGroup.findFirst({
    where: tenantWhere(id, locationId),
    select: { id: true },
  });
  if (!existing) {
    return tenantNotFoundResponse();
  }

  const group = await prisma.modifierGroup.update({
    where: tenantWhere(id, locationId),
    data: {
      name: body.name,
      categories: body.categories,
      required: body.required,
      minSelect: body.minSelect,
      maxSelect: body.maxSelect,
      sortOrder: body.sortOrder,
    },
    include: { options: true, menuItem: { select: { id: true, name: true } } },
  });

  return NextResponse.json(group);
}
