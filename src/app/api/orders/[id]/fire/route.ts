import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/api-auth";
import { ORDER_INCLUDE } from "@/lib/orders";
import { decrementMenuStock } from "@/lib/menu/stock";
import { depleteRecipeForSale } from "@/lib/menu/recipe";
import { isMenuCourse } from "@/lib/kitchen/courses";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requirePermission(request, "add_to_check");
  if (error) return error;

  const { id: orderId } = await params;
  const body = await request.json().catch(() => ({}));
  const courseFilter = body.course && isMenuCourse(body.course) ? body.course : null;

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: true },
  });
  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  const pendingItems = order.items.filter(
    (line) =>
      line.routesToKitchen &&
      line.kitchenStatus === "PENDING" &&
      (!courseFilter || line.course === courseFilter)
  );

  if (pendingItems.length === 0) {
    return NextResponse.json(
      { error: courseFilter ? `No held ${courseFilter.toLowerCase()} items to fire` : "No pending items to fire" },
      { status: 400 }
    );
  }

  const now = new Date();
  await prisma.orderItem.updateMany({
    where: {
      id: { in: pendingItems.map((p) => p.id) },
    },
    data: { kitchenStatus: "FIRED", firedAt: now },
  });

  // Release combo billing parents when all kitchen children are fired
  const refreshed = await prisma.orderItem.findMany({ where: { orderId } });
  for (const parent of refreshed.filter((line) => !line.routesToKitchen && line.kitchenStatus === "HELD")) {
    const children = refreshed.filter((c) => c.parentOrderItemId === parent.id);
    if (children.length > 0 && children.every((c) => c.kitchenStatus === "FIRED")) {
      await prisma.orderItem.update({
        where: { id: parent.id },
        data: { kitchenStatus: "FIRED", firedAt: now },
      });
    }
  }

  await Promise.all(
    pendingItems.map(async (line) => {
      await decrementMenuStock(order.locationId, line.menuItemId, line.quantity);
      await depleteRecipeForSale(order.locationId, line.menuItemId, line.quantity);
    })
  );

  const updated = await prisma.order.update({
    where: { id: orderId },
    data: {
      status: order.status === "PENDING" ? "PREPARING" : order.status,
    },
    include: ORDER_INCLUDE,
  });

  return NextResponse.json(updated);
}
