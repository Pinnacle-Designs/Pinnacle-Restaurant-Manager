import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { OrderStatus } from "@prisma/client";
import { requireAnyPermission, requirePermission } from "@/lib/api-auth";
import { getLocationIdFromRequest } from "@/lib/location";
import { ORDER_INCLUDE } from "@/lib/orders";
import { tenantNotFoundResponse, tenantWhere } from "@/lib/tenant-resource";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAnyPermission(request, ["place_orders", "manage_orders"]);
  if (error) return error;

  const { id } = await params;
  const locationId = await getLocationIdFromRequest(request);
  const order = await prisma.order.findFirst({
    where: tenantWhere(id, locationId),
    include: ORDER_INCLUDE,
  });
  if (!order) {
    return tenantNotFoundResponse("Order not found");
  }
  return NextResponse.json(order);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();

  const keys = Object.keys(body).filter((k) => body[k] !== undefined);
  const statusOnly = keys.length === 1 && keys[0] === "status";
  const { error } = statusOnly
    ? await requireAnyPermission(request, ["place_orders", "manage_orders"])
    : await requirePermission(request, "manage_orders");
  if (error) return error;

  const locationId = await getLocationIdFromRequest(request);
  const existing = await prisma.order.findFirst({
    where: tenantWhere(id, locationId),
    select: { id: true },
  });
  if (!existing) {
    return tenantNotFoundResponse("Order not found");
  }

  const order = await prisma.order.update({
    where: tenantWhere(id, locationId),
    data: {
      status: body.status as OrderStatus | undefined,
      tableId: body.tableId,
      totalAmount: body.totalAmount,
      guestCount: body.guestCount,
      channel: body.channel,
      discountAmount: body.discountAmount,
      compAmount: body.compAmount,
      voidAmount: body.voidAmount,
      ticketTimeMinutes: body.ticketTimeMinutes,
      notes: body.notes,
    },
    include: ORDER_INCLUDE,
  });

  return NextResponse.json(order);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requirePermission(request, "manage_orders");
  if (error) return error;

  const { id } = await params;
  const locationId = await getLocationIdFromRequest(request);
  const existing = await prisma.order.findFirst({
    where: tenantWhere(id, locationId),
    select: { id: true },
  });
  if (!existing) {
    return tenantNotFoundResponse("Order not found");
  }

  await prisma.order.delete({ where: tenantWhere(id, locationId) });
  return NextResponse.json({ success: true });
}
