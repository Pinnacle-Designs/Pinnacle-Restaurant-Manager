import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/api-auth";
import { getLocationIdFromRequest } from "@/lib/location";
import { DISCOUNT_TYPES, hasPaymentsAttached, ORDER_INCLUDE, roundMoney } from "@/lib/orders";
import { tenantNotFoundResponse, tenantWhere } from "@/lib/tenant-resource";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error, user } = await requirePermission(request, "manage_orders");
  if (error) return error;

  const { id } = await params;
  const locationId = await getLocationIdFromRequest(request);
  const body = await request.json();
  const type = body.type as string;
  const amount = roundMoney(Number(body.amount));

  const discountType = DISCOUNT_TYPES.find((d) => d.id === type);
  if (!discountType || !Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: "Invalid discount" }, { status: 400 });
  }

  const order = await prisma.order.findFirst({
    where: tenantWhere(id, locationId),
    include: { payments: true },
  });

  if (!order) {
    return tenantNotFoundResponse("Order not found");
  }
  if (order.checkStatus === "CLOSED") {
    return NextResponse.json({ error: "Check is closed" }, { status: 400 });
  }
  if (hasPaymentsAttached(order.payments)) {
    return NextResponse.json(
      {
        error:
          "This check has a payment attached. Void payment before changing the total.",
      },
      { status: 400 }
    );
  }

  const data =
    discountType.field === "compAmount"
      ? { compAmount: roundMoney(order.compAmount + amount), discountReason: discountType.label }
      : {
          discountAmount: roundMoney(order.discountAmount + amount),
          discountReason: discountType.label,
        };

  const updated = await prisma.order.update({
    where: tenantWhere(id, locationId),
    data,
    include: ORDER_INCLUDE,
  });

  await prisma.activityLog.create({
    data: {
      locationId: order.locationId,
      action: "UPDATE",
      entity: "order",
      entityId: order.id,
      details: `${user!.name} applied ${discountType.label} of $${amount.toFixed(2)}`,
    },
  });

  return NextResponse.json({ order: updated });
}
