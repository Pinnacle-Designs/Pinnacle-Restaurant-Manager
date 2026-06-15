import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/api-auth";
import { ORDER_INCLUDE } from "@/lib/orders";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requirePermission(request, "manage_boh");
  if (error) return error;

  const { id } = await params;
  const body = await request.json();
  const status = body.kitchenStatus === "DONE" ? "DONE" : "FIRED";

  const item = await prisma.orderItem.update({
    where: { id },
    data: { kitchenStatus: status },
  });

  const order = await prisma.order.findUnique({
    where: { id: item.orderId },
    include: ORDER_INCLUDE,
  });

  return NextResponse.json({ item, order });
}
