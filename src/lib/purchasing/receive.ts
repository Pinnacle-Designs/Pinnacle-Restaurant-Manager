import { prisma } from "@/lib/prisma";

export interface ReceiveLineInput {
  poLineId?: string;
  inventoryItemId?: string;
  description: string;
  qtyReceived: number;
  unit: string;
  unitCost: number;
  catchWeightReceived?: number;
  catchWeightBilled?: number;
  catchWeightUnit?: string;
  isSubstitution?: boolean;
  orderedDescription?: string;
}

export async function receiveGoods(
  locationId: string,
  vendor: string,
  lines: ReceiveLineInput[],
  opts?: { poId?: string; receivedBy?: string; notes?: string }
) {
  const receipt = await prisma.goodsReceipt.create({
    data: {
      locationId,
      poId: opts?.poId ?? null,
      vendor,
      receivedBy: opts?.receivedBy ?? null,
      notes: opts?.notes ?? null,
      lines: {
        create: await Promise.all(
          lines.map(async (l) => {
            let orderedDescription = l.orderedDescription ?? null;
            let isSubstitution = l.isSubstitution ?? false;

            if (l.poLineId) {
              const poLine = await prisma.purchaseOrderLine.findUnique({
                where: { id: l.poLineId },
              });
              if (poLine) {
                orderedDescription = orderedDescription ?? poLine.description;
                if (!l.isSubstitution) {
                  const { detectSubstitution } = await import("./vendor-scorecards");
                  isSubstitution = detectSubstitution(poLine.description, l.description);
                }
              }
            }

            return {
              poLineId: l.poLineId ?? null,
              inventoryItemId: l.inventoryItemId ?? null,
              description: l.description,
              qtyReceived: l.qtyReceived,
              unit: l.unit,
              unitCost: l.unitCost,
              catchWeightReceived: l.catchWeightReceived ?? null,
              catchWeightBilled: l.catchWeightBilled ?? null,
              catchWeightUnit: l.catchWeightUnit ?? null,
              isSubstitution,
              orderedDescription,
            };
          })
        ),
      },
    },
    include: { lines: true },
  });

  for (const line of lines) {
    if (line.inventoryItemId) {
      const item = await prisma.inventoryItem.findFirst({
        where: { id: line.inventoryItemId, locationId },
      });
      if (item) {
        const qtyAdd =
          line.catchWeightReceived && item.countByWeight
            ? line.catchWeightReceived
            : line.qtyReceived;
        await prisma.inventoryItem.update({
          where: { id: item.id },
          data: {
            quantity: item.quantity + qtyAdd,
            lastRestocked: new Date(),
            ...(line.unitCost > 0
              ? { previousCostPerUnit: item.costPerUnit, costPerUnit: line.unitCost }
              : {}),
          },
        });
      }
    }

    if (line.poLineId) {
      const poLine = await prisma.purchaseOrderLine.findUnique({ where: { id: line.poLineId } });
      if (poLine) {
        await prisma.purchaseOrderLine.update({
          where: { id: poLine.id },
          data: { qtyReceived: poLine.qtyReceived + line.qtyReceived },
        });
      }
    }
  }

  if (opts?.poId) {
    const po = await prisma.vendorPurchaseOrder.findUnique({
      where: { id: opts.poId },
      include: { lines: true },
    });
    if (po) {
      const allReceived = po.lines.every((l) => l.qtyReceived >= l.qtyOrdered);
      const anyReceived = po.lines.some((l) => l.qtyReceived > 0);
      await prisma.vendorPurchaseOrder.update({
        where: { id: po.id },
        data: {
          status: allReceived ? "RECEIVED" : anyReceived ? "PARTIALLY_RECEIVED" : po.status,
        },
      });
    }
  }

  await prisma.activityLog.create({
    data: {
      locationId,
      action: "RECEIVE",
      entity: "goods_receipt",
      entityId: receipt.id,
      details: `Received ${lines.length} line(s) from ${vendor}${opts?.poId ? ` against PO` : ""}`,
    },
  });

  if (opts?.poId) {
    const { rematchInvoicesForPo } = await import("./three-way-match");
    await rematchInvoicesForPo(opts.poId).catch(() => undefined);
  }

  return receipt;
}
