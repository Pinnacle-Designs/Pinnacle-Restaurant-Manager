import { NextRequest, NextResponse } from "next/server";
import type { PaymentMethod } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAnyPermission } from "@/lib/api-auth";
import { getLocationIdFromRequest } from "@/lib/location";
import {
  deriveCheckStatus,
  getOrderBalanceDue,
  getPaymentsTotal,
  ORDER_INCLUDE,
  roundMoney,
} from "@/lib/orders";
import { tenantNotFoundResponse, tenantWhere } from "@/lib/tenant-resource";

const VALID_METHODS = new Set<PaymentMethod>([
  "CASH",
  "CARD",
  "DEBIT",
  "MOBILE",
  "GIFT_CARD",
  "OTHER",
]);

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

  const method = body.method as PaymentMethod;
  if (!method || !VALID_METHODS.has(method)) {
    return NextResponse.json({ error: "Invalid payment method" }, { status: 400 });
  }

  const amount = roundMoney(Number(body.amount));
  const tipAmount = roundMoney(Number(body.tipAmount) || 0);
  const cashTendered =
    body.cashTendered != null ? roundMoney(Number(body.cashTendered)) : null;
  const checkId = typeof body.checkId === "string" ? body.checkId : null;
  const reference =
    typeof body.reference === "string" && body.reference.trim()
      ? body.reference.trim().slice(0, 64)
      : null;

  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: "Payment amount must be greater than zero" }, { status: 400 });
  }

  const order = await prisma.order.findFirst({
    where: tenantWhere(id, locationId),
    include: { payments: true, table: true, checks: true },
  });

  if (!order) {
    return tenantNotFoundResponse("Order not found");
  }
  if (order.checkStatus === "CLOSED") {
    return NextResponse.json({ error: "Check is closed" }, { status: 400 });
  }
  if (order.status === "CANCELLED") {
    return NextResponse.json({ error: "Cannot pay a cancelled order" }, { status: 400 });
  }

  const balanceDue = getOrderBalanceDue(order, order.payments);
  if (amount > balanceDue + 0.001) {
    return NextResponse.json(
      { error: `Payment exceeds balance due (${balanceDue.toFixed(2)})` },
      { status: 400 }
    );
  }

  if (method === "CASH" && cashTendered != null && cashTendered < amount + tipAmount) {
    return NextResponse.json(
      { error: "Cash tendered is less than payment plus tip" },
      { status: 400 }
    );
  }

  const updated = await prisma.$transaction(async (tx) => {
    const created = await tx.orderPayment.create({
      data: { orderId: id, checkId, method, amount, tipAmount, reference },
    });

    const fresh = await tx.order.findFirst({
      where: tenantWhere(id, locationId),
      include: { payments: true },
    });
    if (!fresh) throw new Error("Order missing");

    const newBalance = getOrderBalanceDue(fresh, fresh.payments);
    const nextCheckStatus = deriveCheckStatus({
      checkStatus: fresh.checkStatus,
      balanceDue: newBalance,
      payments: fresh.payments,
      printedAt: fresh.printedAt,
    });

    const result = await tx.order.update({
      where: tenantWhere(id, locationId),
      data: {
        checkStatus: nextCheckStatus,
        status:
          nextCheckStatus === "PAID" || nextCheckStatus === "NEEDS_TIP"
            ? "SERVED"
            : fresh.status,
      },
      include: ORDER_INCLUDE,
    });

    await tx.activityLog.create({
      data: {
        locationId: order.locationId,
        action: "UPDATE",
        entity: "order",
        entityId: order.id,
        details: `${user!.name} recorded ${method} payment of $${amount.toFixed(2)}${
          tipAmount > 0 ? ` (+$${tipAmount.toFixed(2)} tip)` : ""
        }`,
      },
    });

    return { result, paymentId: created.id };
  });

  const newBalance = getOrderBalanceDue(updated.result, updated.result.payments);
  const changeDue =
    method === "CASH" && cashTendered != null
      ? roundMoney(Math.max(0, cashTendered - amount - tipAmount))
      : null;

  const cardNeedsTip =
    ["CARD", "DEBIT", "MOBILE"].includes(method) && tipAmount <= 0;

  return NextResponse.json({
    order: updated.result,
    paymentId: updated.paymentId,
    changeDue,
    balanceDue: newBalance,
    fullyPaid: newBalance <= 0,
    needsTip: cardNeedsTip,
    nextAction: cardNeedsTip
      ? "Add tip"
      : newBalance > 0
        ? `Collect ${newBalance.toFixed(2)} more`
        : "Close check",
  });
}
