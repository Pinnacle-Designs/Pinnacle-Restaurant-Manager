import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAnyPermission } from "@/lib/api-auth";
import { getLocationIdFromRequest } from "@/lib/location";
import {
  deriveCheckStatus,
  getOrderBalanceDue,
  getPaymentsNeedingTip,
  ORDER_INCLUDE,
  roundMoney,
} from "@/lib/orders";
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
  const body = await request.json();
  const tipAmount = roundMoney(Number(body.tipAmount));
  const paymentId = typeof body.paymentId === "string" ? body.paymentId : undefined;

  if (!Number.isFinite(tipAmount) || tipAmount < 0) {
    return NextResponse.json({ error: "Invalid tip amount" }, { status: 400 });
  }

  const order = await prisma.order.findFirst({
    where: tenantWhere(id, locationId),
    include: { payments: { orderBy: { createdAt: "desc" } } },
  });

  if (!order) {
    return tenantNotFoundResponse("Order not found");
  }
  if (order.checkStatus === "CLOSED") {
    return NextResponse.json(
      { error: "Reopen the check before adding a tip" },
      { status: 400 }
    );
  }

  const target =
    order.payments.find((p) => p.id === paymentId) ??
    order.payments.find(
      (p) => ["CARD", "DEBIT", "MOBILE"].includes(p.method) && p.tipAmount <= 0
    ) ??
    order.payments.find((p) => ["CARD", "DEBIT", "MOBILE", "CASH"].includes(p.method));

  if (!target) {
    return NextResponse.json({ error: "No payment found to tip" }, { status: 400 });
  }
  if (!["CARD", "DEBIT", "MOBILE", "CASH"].includes(target.method)) {
    return NextResponse.json({ error: "Tips can only be added to card or cash payments" }, { status: 400 });
  }

  const updated = await prisma.$transaction(async (tx) => {
    await tx.orderPayment.update({
      where: { id: target.id },
      data: { tipAmount },
    });

    const fresh = await tx.order.findFirst({
      where: tenantWhere(id, locationId),
      include: { payments: true },
    });
    if (!fresh) throw new Error("Order missing");

    const balanceDue = getOrderBalanceDue(fresh, fresh.payments);
    const nextCheckStatus = deriveCheckStatus({
      checkStatus: fresh.checkStatus === "CLOSED" ? "PAID" : fresh.checkStatus,
      balanceDue,
      payments: fresh.payments,
      printedAt: fresh.printedAt,
    });

    const result = await tx.order.update({
      where: tenantWhere(id, locationId),
      data: { checkStatus: nextCheckStatus },
      include: ORDER_INCLUDE,
    });

    await tx.activityLog.create({
      data: {
        locationId: order.locationId,
        action: "UPDATE",
        entity: "order",
        entityId: order.id,
        details: `${user!.name} set ${target.method} tip to $${tipAmount.toFixed(2)}`,
      },
    });

    return result;
  });

  const stillNeedsTip = getPaymentsNeedingTip(updated.payments).length > 0;

  return NextResponse.json({
    order: updated,
    paymentId: target.id,
    stillNeedsTip,
    nextAction: stillNeedsTip ? "Enter remaining tips" : "Close check",
  });
}
