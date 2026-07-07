import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/api-auth";
import { getLocationIdFromRequest } from "@/lib/location";
import { deriveCheckStatus, getOrderBalanceDue, ORDER_INCLUDE } from "@/lib/orders";
import { tenantNotFoundResponse, tenantWhere } from "@/lib/tenant-resource";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error, user } = await requirePermission(request, "manage_orders");
  if (error) return error;

  const { id } = await params;
  const locationId = await getLocationIdFromRequest(request);

  const order = await prisma.order.findFirst({
    where: tenantWhere(id, locationId),
    include: { payments: true, table: true },
  });

  if (!order) {
    return tenantNotFoundResponse("Order not found");
  }
  if (order.checkStatus !== "CLOSED") {
    return NextResponse.json({ error: "Check is not closed" }, { status: 400 });
  }

  const balanceDue = getOrderBalanceDue(order, order.payments);
  const nextCheckStatus = deriveCheckStatus({
    checkStatus: "OPEN",
    balanceDue,
    payments: order.payments,
    printedAt: order.printedAt,
  });

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.order.update({
      where: tenantWhere(id, locationId),
      data: {
        checkStatus: nextCheckStatus,
        status: "SERVED",
        paidAt: null,
      },
      include: ORDER_INCLUDE,
    });

    if (order.tableId) {
      await tx.table.update({
        where: { id: order.tableId },
        data: { status: "occupied" },
      });
    }

    await tx.activityLog.create({
      data: {
        locationId: order.locationId,
        action: "UPDATE",
        entity: "order",
        entityId: order.id,
        details: `${user!.name} reopened check for edits`,
      },
    });

    return result;
  });

  return NextResponse.json({ order: updated });
}
