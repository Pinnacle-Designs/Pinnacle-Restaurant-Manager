import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/api-auth";
import { hasPaymentsAttached, ORDER_INCLUDE } from "@/lib/orders";
import { decrementMenuStock } from "@/lib/menu/stock";
import { depleteRecipeForSale } from "@/lib/menu/recipe";
import { normalizeSalesCategory, defaultSalesCategoryForMenuCategory } from "@/lib/menu/sales-categories";
import { buildOrderLinesForMenuItem } from "@/lib/kitchen/routing";
import { normalizeCourse } from "@/lib/kitchen/courses";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requirePermission(request, "add_to_check");
  if (error) return error;

  const { id: orderId } = await params;
  const body = await request.json();

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: true, payments: true },
  });
  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }
  if (order.checkStatus === "CLOSED" || order.status === "CANCELLED") {
    return NextResponse.json({ error: "Cannot modify a closed order" }, { status: 400 });
  }
  if (hasPaymentsAttached(order.payments)) {
    return NextResponse.json(
      { error: "Void payments before adding items to this check" },
      { status: 400 }
    );
  }

  const quantity = body.quantity || 1;
  const linePrice = body.price;
  const fireNow = body.fireToKitchen === true;
  const course = normalizeCourse(body.course);

  const lineInputs = await buildOrderLinesForMenuItem({
    locationId: order.locationId,
    menuItemId: body.menuItemId,
    quantity,
    linePrice,
    seatNumber: body.seatNumber ?? null,
    modifiers: body.modifiers ? JSON.stringify(body.modifiers) : null,
    modifierSummary: body.modifierSummary ?? null,
    course,
    fireNow,
  });

  const parent = await prisma.orderItem.create({
    data: {
      orderId,
      menuItemId: lineInputs[0].menuItemId,
      quantity: lineInputs[0].quantity,
      price: lineInputs[0].price,
      seatNumber: lineInputs[0].seatNumber,
      modifiers: lineInputs[0].modifiers,
      modifierSummary: lineInputs[0].modifierSummary,
      course: lineInputs[0].course,
      kitchenStatus: lineInputs[0].kitchenStatus,
      firedAt: lineInputs[0].firedAt,
      routesToKitchen: lineInputs[0].routesToKitchen,
      kitchenStationId: lineInputs[0].kitchenStationId,
    },
  });

  for (let i = 1; i < lineInputs.length; i++) {
    const line = lineInputs[i];
    await prisma.orderItem.create({
      data: {
        orderId,
        menuItemId: line.menuItemId,
        quantity: line.quantity,
        price: line.price,
        seatNumber: line.seatNumber,
        modifiers: line.modifiers,
        modifierSummary: line.modifierSummary,
        course: line.course,
        kitchenStatus: line.kitchenStatus,
        firedAt: line.firedAt,
        routesToKitchen: line.routesToKitchen,
        kitchenStationId: line.kitchenStationId,
        parentOrderItemId: parent.id,
      },
    });
  }

  if (fireNow) {
    await decrementMenuStock(order.locationId, body.menuItemId, quantity);
    await depleteRecipeForSale(order.locationId, body.menuItemId, quantity);
    for (let i = 1; i < lineInputs.length; i++) {
      const child = lineInputs[i];
      if (child.routesToKitchen) {
        await depleteRecipeForSale(order.locationId, child.menuItemId, child.quantity * quantity);
      }
    }
  }

  const lineTotal = quantity * linePrice;
  const updated = await prisma.order.update({
    where: { id: orderId },
    data: {
      totalAmount: order.totalAmount + lineTotal,
      status: fireNow && order.status === "PENDING" ? "PREPARING" : order.status,
    },
    include: ORDER_INCLUDE,
  });

  return NextResponse.json(updated);
}
