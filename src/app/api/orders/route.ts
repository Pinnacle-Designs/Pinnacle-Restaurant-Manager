import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getLocationIdFromRequest } from "@/lib/location";
import { getSessionUserFromRequest } from "@/lib/auth";
import { requirePermission, unauthorizedResponse } from "@/lib/api-auth";

export async function GET(request: NextRequest) {
  const user = await getSessionUserFromRequest(request);
  if (!user) return unauthorizedResponse();

  const locationId = await getLocationIdFromRequest(request);
  const orders = await prisma.order.findMany({
    where: { locationId },
    include: {
      table: true,
      items: { include: { menuItem: true } },
    },
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
      status: "PENDING",
      totalAmount: body.totalAmount || 0,
      guestCount: body.guestCount ?? 1,
      channel: body.channel || "dine-in",
      notes: body.notes,
      items: body.items
        ? {
            create: body.items.map(
              (item: { menuItemId: string; quantity: number; price: number }) => ({
                menuItemId: item.menuItemId,
                quantity: item.quantity,
                price: item.price,
              })
            ),
          }
        : undefined,
    },
    include: { items: { include: { menuItem: true } }, table: true },
  });

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
