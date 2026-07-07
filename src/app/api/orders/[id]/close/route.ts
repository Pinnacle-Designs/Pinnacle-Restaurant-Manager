import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAnyPermission } from "@/lib/api-auth";
import { getLocationIdFromRequest } from "@/lib/location";
import { getOrderBalanceDue, needsTipEntry, ORDER_INCLUDE } from "@/lib/orders";
import { tenantNotFoundResponse, tenantWhere } from "@/lib/tenant-resource";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error, user } = await requireAnyPermission(request, [
    "manage_orders",
    "place_orders",
  ]);
  if (error) return error;

  const { id } = await params;
  const locationId = await getLocationIdFromRequest(request);
  const body = await request.json().catch(() => ({}));
  const skipTipWarning = body.skipTipWarning === true;

  const order = await prisma.order.findFirst({
    where: tenantWhere(id, locationId),
    include: { payments: true, table: true },
  });

  if (!order) {
    return tenantNotFoundResponse("Order not found");
  }

  const balanceDue = getOrderBalanceDue(order, order.payments);
  if (balanceDue > 0.001) {
    return NextResponse.json(
      { error: `Cannot close — $${balanceDue.toFixed(2)} remaining` },
      { status: 400 }
    );
  }

  if (!skipTipWarning && needsTipEntry(order.payments)) {
    return NextResponse.json(
      {
        error: "Card payment has no tip. Close anyway?",
        requiresConfirmation: true,
        code: "NEEDS_TIP",
      },
      { status: 409 }
    );
  }

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.order.update({
      where: tenantWhere(id, locationId),
      data: {
        checkStatus: "CLOSED",
        status: "PAID",
        paidAt: new Date(),
      },
      include: ORDER_INCLUDE,
    });

    if (order.tableId) {
      await tx.table.update({
        where: { id: order.tableId },
        data: { status: "available" },
      });
    }

    await tx.activityLog.create({
      data: {
        locationId: order.locationId,
        action: "UPDATE",
        entity: "order",
        entityId: order.id,
        details: `${user!.name} closed check`,
      },
    });

    return result;
  });

  return NextResponse.json({ order: updated });
}
