import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/api-auth";
import { getLocationIdFromRequest } from "@/lib/location";
import { ORDER_INCLUDE } from "@/lib/orders";
import { tenantChildWhere, tenantNotFoundResponse } from "@/lib/tenant-resource";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requirePermission(request, "manage_boh");
  if (error) return error;

  const { id } = await params;
  const locationId = await getLocationIdFromRequest(request);
  const body = await request.json();
  const status = body.kitchenStatus === "DONE" ? "DONE" : "FIRED";

  const existing = await prisma.orderItem.findFirst({
    where: tenantChildWhere(id, locationId, "order"),
    select: { id: true, orderId: true },
  });
  if (!existing) {
    return tenantNotFoundResponse();
  }

  const item = await prisma.orderItem.update({
    where: { id: existing.id },
    data: { kitchenStatus: status },
  });

  const order = await prisma.order.findFirst({
    where: { id: existing.orderId, locationId },
    include: ORDER_INCLUDE,
  });

  return NextResponse.json({ item, order });
}
