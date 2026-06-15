import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getLocationIdFromRequest } from "@/lib/location";
import { getSessionUserFromRequest } from "@/lib/auth";
import { requirePermission, unauthorizedResponse } from "@/lib/api-auth";
import { ORDER_INCLUDE } from "@/lib/orders";
import { decrementMenuStock } from "@/lib/menu/stock";

export async function GET(request: NextRequest) {
  const user = await getSessionUserFromRequest(request);
  if (!user) return unauthorizedResponse();

  const locationId = await getLocationIdFromRequest(request);
  const orders = await prisma.order.findMany({
    where: { locationId },
    include: ORDER_INCLUDE,
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(orders);
}

export async function POST(request: NextRequest) {
  const { error } = await requirePermission(request, "place_orders");
  if (error) return error;

  const locationId = await getLocationIdFromRequest(request);
  const body = await request.json();

  const order = await prisma.order.create({
    data: {
      locationId,
      tableId: body.tableId,
      status: body.items?.length ? "PREPARING" : "PENDING",
      totalAmount: body.totalAmount || 0,
      guestCount: body.guestCount ?? 1,
      channel: body.channel || "dine-in",
      notes: body.notes,
      items: body.items
        ? {
            create: body.items.map(
              (item: {
                menuItemId: string;
                quantity: number;
                price: number;
                seatNumber?: number;
                modifiers?: unknown;
                modifierSummary?: string;
              }) => ({
                menuItemId: item.menuItemId,
                quantity: item.quantity,
                price: item.price,
                seatNumber: item.seatNumber ?? null,
                modifiers: item.modifiers ? JSON.stringify(item.modifiers) : null,
                modifierSummary: item.modifierSummary ?? null,
                kitchenStatus: "FIRED",
                firedAt: new Date(),
              })
            ),
          }
        : undefined,
    },
    include: ORDER_INCLUDE,
  });

  if (body.items?.length) {
    for (const item of body.items as { menuItemId: string; quantity: number }[]) {
      await decrementMenuStock(locationId, item.menuItemId, item.quantity || 1);
    }
  }

  await prisma.activityLog.create({
    data: {
      locationId,
      action: "CREATE",
      entity: "order",
      entityId: order.id,
      details: `New order: $${order.totalAmount}`,
    },
  });

  return NextResponse.json(order);
}
