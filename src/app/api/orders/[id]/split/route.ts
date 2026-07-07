import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAnyPermission } from "@/lib/api-auth";
import { getLocationIdFromRequest } from "@/lib/location";
import { getCheckItemTotal, hasPaymentsAttached, ORDER_INCLUDE } from "@/lib/orders";
import { tenantNotFoundResponse, tenantWhere } from "@/lib/tenant-resource";

type SplitAssignment = { itemId: string; checkId: string | null };

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAnyPermission(request, [
    "manage_orders",
    "place_orders",
  ]);
  if (error) return error;

  const { id } = await params;
  const locationId = await getLocationIdFromRequest(request);
  const body = await request.json();
  const mode = body.mode as "even" | "item" | "seat";
  const ways = Math.max(2, Math.min(12, parseInt(body.ways, 10) || 2));
  const assignments = (body.assignments ?? []) as SplitAssignment[];

  const order = await prisma.order.findFirst({
    where: tenantWhere(id, locationId),
    include: { items: true, payments: true, checks: true },
  });

  if (!order) {
    return tenantNotFoundResponse("Order not found");
  }
  if (order.checkStatus === "CLOSED") {
    return NextResponse.json({ error: "Check is closed" }, { status: 400 });
  }
  if (hasPaymentsAttached(order.payments)) {
    return NextResponse.json(
      { error: "Void payments before changing split checks" },
      { status: 400 }
    );
  }

  const updated = await prisma.$transaction(async (tx) => {
    await tx.orderCheck.deleteMany({ where: { orderId: id } });
    await tx.orderItem.updateMany({
      where: { orderId: id },
      data: { checkId: null },
    });

    if (mode === "even") {
      const checks = [];
      for (let i = 1; i <= ways; i++) {
        checks.push(
          await tx.orderCheck.create({
            data: { orderId: id, label: `Check ${i}` },
          })
        );
      }
      const items = await tx.orderItem.findMany({ where: { orderId: id } });
      for (let index = 0; index < items.length; index++) {
        const check = checks[index % checks.length];
        await tx.orderItem.update({
          where: { id: items[index].id },
          data: { checkId: check.id },
        });
      }
    } else if (mode === "seat") {
      const seats = [
        ...new Set(order.items.map((i) => i.seatNumber).filter((s): s is number => !!s)),
      ];
      const seatList = seats.length > 0 ? seats : [1, 2];
      for (const seat of seatList) {
        const check = await tx.orderCheck.create({
          data: { orderId: id, label: `Seat ${seat}`, seatNumber: seat },
        });
        await tx.orderItem.updateMany({
          where: { orderId: id, seatNumber: seat },
          data: { checkId: check.id },
        });
      }
      const unassigned = await tx.orderItem.findMany({
        where: { orderId: id, checkId: null },
      });
      if (unassigned.length > 0) {
        const misc = await tx.orderCheck.create({
          data: { orderId: id, label: "Shared" },
        });
        await tx.orderItem.updateMany({
          where: { orderId: id, checkId: null },
          data: { checkId: misc.id },
        });
      }
    } else if (mode === "item" && assignments.length > 0) {
      const checkIds = [...new Set(assignments.map((a) => a.checkId).filter(Boolean))];
      const checkMap = new Map<string, string>();
      let counter = 1;
      for (const checkId of checkIds) {
        if (!checkId) continue;
        if (!checkMap.has(checkId)) {
          const created = await tx.orderCheck.create({
            data: { orderId: id, label: `Check ${counter++}` },
          });
          checkMap.set(checkId, created.id);
        }
      }
      for (const assignment of assignments) {
        if (!assignment.checkId) {
          await tx.orderItem.update({
            where: { id: assignment.itemId },
            data: { checkId: null },
          });
          continue;
        }
        const realCheckId = checkMap.get(assignment.checkId);
        if (realCheckId) {
          await tx.orderItem.update({
            where: { id: assignment.itemId },
            data: { checkId: realCheckId },
          });
        }
      }
    }

    return tx.order.findFirst({
      where: tenantWhere(id, locationId),
      include: ORDER_INCLUDE,
    });
  });

  const checksWithTotals = updated?.checks.map((check) => ({
    ...check,
    total: getCheckItemTotal(check.items),
  }));

  return NextResponse.json({ order: updated, checksWithTotals });
}
