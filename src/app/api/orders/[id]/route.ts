import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { OrderStatus } from "@prisma/client";
import { requireAnyPermission, requirePermission } from "@/lib/api-auth";
import { ORDER_INCLUDE } from "@/lib/orders";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAnyPermission(request, ["place_orders", "manage_orders"]);
  if (error) return error;

  const { id } = await params;
  const order = await prisma.order.findUnique({
    where: { id },
    include: ORDER_INCLUDE,
  });
  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
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

  const order = await prisma.order.update({
    where: { id },
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
  await prisma.order.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
