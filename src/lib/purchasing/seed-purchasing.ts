import { addDays } from "date-fns";
import { prisma } from "@/lib/prisma";

export async function seedPurchasingSample(locationId: string) {
  const existing = await prisma.vendorPurchaseOrder.count({ where: { locationId, source: "SUGGESTED" } });
  if (existing > 0) return;

  const inventory = await prisma.inventoryItem.findMany({
    where: { locationId },
    take: 6,
    orderBy: { quantity: "asc" },
  });
  if (inventory.length < 3) return;

  const vendor = inventory[0]!.supplier ?? "Hill Country Meats";

  const poLines = inventory.slice(0, 4).map((item) => {
    const qty = Math.ceil(item.minQuantity * 2);
    const unitPrice = item.costPerUnit;
    return {
      inventoryItemId: item.id,
      description: item.name,
      qtyOrdered: qty,
      qtyReceived: 0,
      unit: item.unit,
      unitPrice,
      lineTotal: Math.round(qty * unitPrice * 100) / 100,
    };
  });

  const totalAmount = poLines.reduce((s, l) => s + l.lineTotal, 0);

  const po = await prisma.vendorPurchaseOrder.create({
    data: {
      locationId,
      vendor,
      poNumber: "PO-DEMO-1001",
      status: "SUBMITTED",
      source: "SUGGESTED",
      lineCount: poLines.length,
      totalAmount,
      expectedAt: addDays(new Date(), 1),
      linesJson: JSON.stringify(poLines),
      lines: { create: poLines },
    },
    include: { lines: true },
  });

  // Partial receive for first two lines
  const receiveLines = po.lines.slice(0, 2).map((pl) => ({
    poLineId: pl.id,
    inventoryItemId: pl.inventoryItemId,
    description: pl.description,
    qtyReceived: pl.qtyOrdered,
    unit: pl.unit,
    unitCost: pl.unitPrice,
  }));

  const receipt = await prisma.goodsReceipt.create({
    data: {
      locationId,
      poId: po.id,
      vendor,
      receivedBy: "Demo Manager",
      lines: { create: receiveLines },
    },
    include: { lines: true },
  });

  for (const line of receiveLines) {
    if (line.inventoryItemId) {
      const item = await prisma.inventoryItem.findUnique({ where: { id: line.inventoryItemId } });
      if (item) {
        await prisma.inventoryItem.update({
          where: { id: item.id },
          data: { quantity: item.quantity + line.qtyReceived, lastRestocked: new Date() },
        });
      }
    }
    await prisma.purchaseOrderLine.update({
      where: { id: line.poLineId },
      data: { qtyReceived: line.qtyReceived },
    });
  }

  await prisma.vendorPurchaseOrder.update({
    where: { id: po.id },
    data: { status: "PARTIALLY_RECEIVED" },
  });

  // Invoice with intentional price discrepancy on line 3
  const invoiceLines = po.lines.map((pl, idx) => ({
    inventoryItemId: pl.inventoryItemId,
    description: pl.description,
    qty: pl.qtyOrdered,
    unit: pl.unit,
    unitPrice: idx === 2 ? pl.unitPrice * 1.12 : pl.unitPrice,
    lineTotal: Math.round(pl.qtyOrdered * (idx === 2 ? pl.unitPrice * 1.12 : pl.unitPrice) * 100) / 100,
    sku: `SKU-${idx + 1}`,
  }));

  const invoiceAmount = invoiceLines.reduce((s, l) => s + l.lineTotal, 0);

  await prisma.vendorInvoice.create({
    data: {
      locationId,
      vendor,
      amount: invoiceAmount,
      category: "Food & Supplies",
      invoiceNumber: "INV-88421",
      poId: po.id,
      receiptId: receipt.id,
      priceChangePct: 8.5,
      matchStatus: "DISCREPANCY",
      matchNotes: JSON.stringify([
        {
          field: "price",
          description: `${invoiceLines[2]!.description}: PO price vs invoice price`,
          severity: "HIGH",
        },
      ]),
      lines: { create: invoiceLines },
    },
  });

  await prisma.vendorCredit.create({
    data: {
      locationId,
      vendor,
      amount: 47.5,
      reason: "2 cases damaged brisket — refused at dock",
      status: "OPEN",
      itemsJson: JSON.stringify([{ item: "Brisket", qty: 2, unit: "case" }]),
    },
  });

  await prisma.externalFactor.create({
    data: {
      locationId,
      date: addDays(new Date(), 7),
      factorType: "holiday",
      description: "Memorial Day weekend — expect 25% lift",
      impactPct: 25,
    },
  });
}
