import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/api-auth";
import { getLocationIdFromRequest } from "@/lib/location";
import { tenantNotFoundResponse, tenantWhere } from "@/lib/tenant-resource";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requirePermission(request, "manage_tables");
  if (error) return error;

  const { id } = await params;
  const locationId = await getLocationIdFromRequest(request);
  const body = await request.json();

  const existing = await prisma.table.findFirst({
    where: tenantWhere(id, locationId),
    select: { id: true },
  });
  if (!existing) {
    return tenantNotFoundResponse();
  }

  const table = await prisma.table.update({
    where: tenantWhere(id, locationId),
    data: {
      number: body.number,
      label: body.label,
      capacity: body.capacity,
      status: body.status,
      section: body.section,
      shape: body.shape,
      posX: body.posX,
      posY: body.posY,
      width: body.width,
      height: body.height,
      rotation: body.rotation,
    },
  });

  return NextResponse.json(table);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requirePermission(request, "manage_tables");
  if (error) return error;

  const { id } = await params;
  const locationId = await getLocationIdFromRequest(request);
  const existing = await prisma.table.findFirst({
    where: tenantWhere(id, locationId),
    select: { id: true },
  });
  if (!existing) {
    return tenantNotFoundResponse();
  }

  await prisma.table.delete({ where: tenantWhere(id, locationId) });
  return NextResponse.json({ success: true });
}
