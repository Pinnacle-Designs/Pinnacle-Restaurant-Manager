import { addDays, subDays } from "date-fns";
import { prisma } from "@/lib/prisma";

const DEMO_RECEIPT_IMAGE = "/logo.png";

/** Full purchasing demo — each sub-seed is idempotent with its own guard. */
export async function seedPurchasingSample(locationId: string) {
  await seedThreeWayMatchDemo(locationId);
  await seedVendorBiddingPrices(locationId);
  await seedVendorScorecardDemos(locationId);
  await seedDraftPurchaseOrders(locationId);
  await seedInvoiceDigitizationDemos(locationId);
}

async function seedThreeWayMatchDemo(locationId: string) {
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

  // Partial receive — include catch-weight demo on meat/brisket line when present
  const catchWeightLineIdx = po.lines.findIndex((pl) =>
    /brisket|beef|pork|fish|salmon/i.test(pl.description)
  );
  const receiveLines = po.lines.slice(0, 2).map((pl, idx) => {
    const isCatch = idx === catchWeightLineIdx && catchWeightLineIdx >= 0 && catchWeightLineIdx < 2;
    return {
      poLineId: pl.id,
      inventoryItemId: pl.inventoryItemId,
      description: pl.description,
      qtyReceived: pl.qtyOrdered,
      unit: pl.unit,
      unitCost: pl.unitPrice,
      ...(isCatch
        ? {
            catchWeightReceived: 38.2,
            catchWeightBilled: 42.5,
            catchWeightUnit: "lbs",
          }
        : {}),
    };
  });

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

  // Invoice with intentional price discrepancy on line 3 + catch-weight overbill demo
  const invoiceLines = po.lines.map((pl, idx) => {
    const isCatch = idx === catchWeightLineIdx && catchWeightLineIdx >= 0;
    const unitPrice = idx === 2 ? pl.unitPrice * 1.12 : pl.unitPrice;
    return {
      inventoryItemId: pl.inventoryItemId,
      description: pl.description,
      qty: pl.qtyOrdered,
      unit: isCatch ? "case" : pl.unit,
      unitPrice,
      lineTotal: Math.round(pl.qtyOrdered * unitPrice * 100) / 100,
      sku: `SKU-${idx + 1}`,
      ...(isCatch ? { catchWeightBilled: 42.5, catchWeightUnit: "lbs" } : {}),
    };
  });

  const invoiceAmount = invoiceLines.reduce((s, l) => s + l.lineTotal, 0);

  const createdInvoice = await prisma.vendorInvoice.create({
    data: {
      locationId,
      vendor,
      amount: invoiceAmount,
      category: "Food & Supplies",
      invoiceNumber: "INV-88421",
      poId: po.id,
      receiptId: receipt.id,
      priceChangePct: 8.5,
      matchStatus: "PENDING",
      imageUrl: DEMO_RECEIPT_IMAGE,
      lines: { create: invoiceLines },
    },
  });
  const { runThreeWayMatch } = await import("./three-way-match");
  await runThreeWayMatch(createdInvoice.id);
  const inv = await prisma.vendorInvoice.findUnique({
    where: { id: createdInvoice.id },
    include: { lines: true },
  });
  if (inv) {
    const { auditCatchWeight, persistCatchWeightInsights } = await import("./catch-weight");
    const catchAlerts = auditCatchWeight({
      invoiceLines: inv.lines,
      receiptLines: receipt.lines,
    });
    await persistCatchWeightInsights(locationId, vendor, catchAlerts);

    await prisma.vendorCredit.create({
      data: {
        locationId,
        vendor,
        amount: 47.5,
        reason: "2 cases shattered glass cups — refused at dock",
        category: "DAMAGED",
        status: "OPEN",
        invoiceId: inv.id,
        accountingLocked: true,
        photoUrl: DEMO_RECEIPT_IMAGE,
        repEmail: `rep@${vendor.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 20)}.orders`,
        emailStatus: "DEMO",
        emailSentAt: new Date(),
        reportedBy: "Demo dishwasher",
        itemsJson: JSON.stringify([{ item: "Glass cups", qty: 2, unit: "case" }]),
      },
    });
    await prisma.vendorInvoice.update({
      where: { id: inv.id },
      data: {
        accountingSyncLocked: true,
        paymentHoldReason: "Pending credit memo $47.50 — shattered glass cups",
      },
    });
  }

  // Cooking oil price spike demo for OCR/alert testing
  const oilItem = await prisma.inventoryItem.findFirst({
    where: { locationId, name: { contains: "oil" } },
  });
  if (oilItem) {
    await prisma.inventoryItem.update({
      where: { id: oilItem.id },
      data: { previousCostPerUnit: oilItem.costPerUnit, costPerUnit: oilItem.costPerUnit * 1.15 },
    });
    await prisma.businessInsight.create({
      data: {
        locationId,
        title: `Price spike: ${oilItem.name}`,
        description: `${vendor} raised ${oilItem.name} from $${oilItem.costPerUnit.toFixed(2)} to $${(oilItem.costPerUnit * 1.15).toFixed(2)} (+15%). Recipe costs recalculated.`,
        category: "INVENTORY",
        severity: "CRITICAL",
        actionable: "Negotiate with vendor or find alternate supplier",
        dataSnapshot: JSON.stringify({
          item: oilItem.name,
          oldPrice: oilItem.costPerUnit,
          newPrice: oilItem.costPerUnit * 1.15,
          changePct: 15,
          vendor,
        }),
      },
    });
  }

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

/** Smart draft POs per vendor — powers Purchase Orders → Smart POs tab */
async function seedDraftPurchaseOrders(locationId: string) {
  const existing = await prisma.vendorPurchaseOrder.count({
    where: { locationId, status: "DRAFT", source: "AUTO_DRAFT" },
  });
  if (existing > 0) return;

  const { buildDraftPurchaseOrdersByVendor } = await import("./draft-orders");
  await buildDraftPurchaseOrdersByVendor(locationId);
}

/** Standalone OCR-scanned invoice + backfill image on three-way match invoice */
async function seedInvoiceDigitizationDemos(locationId: string) {
  const inv88421 = await prisma.vendorInvoice.findFirst({
    where: { locationId, invoiceNumber: "INV-88421" },
  });
  if (inv88421 && !inv88421.imageUrl) {
    await prisma.vendorInvoice.update({
      where: { id: inv88421.id },
      data: { imageUrl: DEMO_RECEIPT_IMAGE },
    });
  }

  const openCredit = await prisma.vendorCredit.findFirst({
    where: { locationId, status: "OPEN", category: "DAMAGED" },
  });
  if (openCredit && !openCredit.photoUrl) {
    await prisma.vendorCredit.update({
      where: { id: openCredit.id },
      data: { photoUrl: DEMO_RECEIPT_IMAGE },
    });
  }

  const ocrMarker = await prisma.vendorInvoice.findFirst({
    where: { locationId, invoiceNumber: "INV-OCR-DEMO" },
  });
  if (ocrMarker) return;

  const items = await prisma.inventoryItem.findMany({
    where: { locationId },
    take: 4,
    orderBy: { name: "asc" },
  });
  if (items.length < 2) return;

  const vendor = "Green Valley Produce";
  const lines = items.slice(0, 3).map((item, idx) => {
    const qty = Math.ceil(item.minQuantity * 1.5);
    const unitPrice = item.costPerUnit;
    return {
      inventoryItemId: item.id,
      description: item.name,
      qty,
      unit: item.unit,
      unitPrice,
      lineTotal: Math.round(qty * unitPrice * 100) / 100,
      sku: `GV-${idx + 1}`,
    };
  });
  const amount = lines.reduce((s, l) => s + l.lineTotal, 0);

  const scanned = await prisma.vendorInvoice.create({
    data: {
      locationId,
      vendor,
      amount,
      category: "Food & Supplies",
      invoiceNumber: "INV-OCR-DEMO",
      imageUrl: DEMO_RECEIPT_IMAGE,
      matchStatus: "PENDING",
      priceChangePct: 3.2,
      lines: { create: lines },
    },
    include: { lines: true },
  });

  const { processDigitizedInvoice } = await import("./invoice-digitization");
  await processDigitizedInvoice(locationId, {
    id: scanned.id,
    vendor: scanned.vendor,
    amount: scanned.amount,
    invoiceNumber: scanned.invoiceNumber,
    invoiceDate: scanned.createdAt,
    imageUrl: scanned.imageUrl,
    poId: scanned.poId,
    receiptId: scanned.receiptId,
    lines: scanned.lines.map((l) => ({
      description: l.description,
      qty: l.qty,
      unit: l.unit,
      unitPrice: l.unitPrice,
      lineTotal: l.lineTotal,
      sku: l.sku,
      inventoryItemId: l.inventoryItemId,
      catchWeightBilled: l.catchWeightBilled,
      catchWeightUnit: l.catchWeightUnit,
    })),
  });

  const appliedCredit = await prisma.vendorCredit.findFirst({
    where: { locationId, status: "APPLIED" },
  });
  if (!appliedCredit) {
    await prisma.vendorCredit.create({
      data: {
        locationId,
        vendor: "Metro Restaurant Supply",
        amount: 18.4,
        reason: "Short-ship on paper goods — credit applied to next invoice",
        category: "SHORT_SHIP",
        status: "APPLIED",
        resolvedAt: subDays(new Date(), 30),
        reportedBy: "Demo Manager",
      },
    });
  }
}

/** Historical deliveries for fill rate, on-time, and substitution scorecards */
async function seedVendorScorecardDemos(locationId: string) {  const marker = await prisma.goodsReceipt.findFirst({
    where: { locationId, vendor: "Green Valley Produce", notes: "scorecard-demo" },
  });
  if (marker) return;

  const items = await prisma.inventoryItem.findMany({
    where: { locationId },
    take: 8,
    orderBy: { name: "asc" },
  });
  if (items.length < 4) return;

  const now = new Date();

  // Reliable produce vendor — on-time, full fill
  const produceItem = items.find((i) => /onion|lettuce|produce/i.test(i.name)) ?? items[0]!;
  const expectedProduce = new Date(now);
  expectedProduce.setDate(expectedProduce.getDate() - 14);
  expectedProduce.setHours(9, 0, 0, 0);
  const receivedProduce = new Date(expectedProduce);
  receivedProduce.setMinutes(45);

  const goodPo = await prisma.vendorPurchaseOrder.create({
    data: {
      locationId,
      vendor: "Green Valley Produce",
      poNumber: "PO-SCORE-GOOD",
      status: "RECEIVED",
      source: "MANUAL",
      lineCount: 1,
      totalAmount: produceItem.costPerUnit * 10,
      expectedAt: expectedProduce,
      submittedAt: new Date(expectedProduce.getTime() - 86400000),
      lines: {
        create: {
          inventoryItemId: produceItem.id,
          description: produceItem.name,
          qtyOrdered: 10,
          qtyReceived: 10,
          unit: produceItem.unit,
          unitPrice: produceItem.costPerUnit,
          lineTotal: produceItem.costPerUnit * 10,
        },
      },
    },
    include: { lines: true },
  });

  await prisma.goodsReceipt.create({
    data: {
      locationId,
      poId: goodPo.id,
      vendor: "Green Valley Produce",
      receivedAt: receivedProduce,
      receivedBy: "Demo",
      notes: "scorecard-demo",
      lines: {
        create: {
          poLineId: goodPo.lines[0]!.id,
          inventoryItemId: produceItem.id,
          description: produceItem.name,
          qtyReceived: 10,
          unit: produceItem.unit,
          unitCost: produceItem.costPerUnit,
          orderedDescription: produceItem.name,
          isSubstitution: false,
        },
      },
    },
  });

  // Problem vendor — late delivery + brand substitution
  const oilItem = items.find((i) => /oil/i.test(i.name)) ?? items[1]!;
  const expectedLate = new Date(now);
  expectedLate.setDate(expectedLate.getDate() - 7);
  expectedLate.setHours(9, 0, 0, 0);
  const receivedLate = new Date(expectedLate);
  receivedLate.setHours(12, 35, 0, 0);

  const latePo = await prisma.vendorPurchaseOrder.create({
    data: {
      locationId,
      vendor: "Metro Restaurant Supply",
      poNumber: "PO-SCORE-LATE",
      status: "RECEIVED",
      source: "MANUAL",
      lineCount: 1,
      totalAmount: oilItem.costPerUnit * 4,
      expectedAt: expectedLate,
      submittedAt: new Date(expectedLate.getTime() - 86400000),
      lines: {
        create: {
          inventoryItemId: oilItem.id,
          description: "Premium extra virgin olive oil (requested)",
          qtyOrdered: 4,
          qtyReceived: 4,
          unit: "case",
          unitPrice: oilItem.costPerUnit,
          lineTotal: oilItem.costPerUnit * 4,
        },
      },
    },
    include: { lines: true },
  });

  await prisma.goodsReceipt.create({
    data: {
      locationId,
      poId: latePo.id,
      vendor: "Metro Restaurant Supply",
      receivedAt: receivedLate,
      receivedBy: "Demo dishwasher",
      notes: "scorecard-demo",
      lines: {
        create: {
          poLineId: latePo.lines[0]!.id,
          inventoryItemId: oilItem.id,
          description: "Generic blend olive oil",
          qtyReceived: 4,
          unit: "case",
          unitCost: oilItem.costPerUnit * 0.85,
          orderedDescription: "Premium extra virgin olive oil (requested)",
          isSubstitution: true,
        },
      },
    },
  });

  // Short-ship vendor
  const meatItem = items.find((i) => /chicken|beef|brisket/i.test(i.name)) ?? items[2]!;
  const expectedShort = new Date(now);
  expectedShort.setDate(expectedShort.getDate() - 21);
  expectedShort.setHours(8, 0, 0, 0);

  const shortPo = await prisma.vendorPurchaseOrder.create({
    data: {
      locationId,
      vendor: "Budget Broadline Co",
      poNumber: "PO-SCORE-SHORT",
      status: "PARTIALLY_RECEIVED",
      source: "MANUAL",
      lineCount: 1,
      totalAmount: meatItem.costPerUnit * 20,
      expectedAt: expectedShort,
      submittedAt: new Date(expectedShort.getTime() - 86400000),
      lines: {
        create: {
          inventoryItemId: meatItem.id,
          description: meatItem.name,
          qtyOrdered: 20,
          qtyReceived: 14,
          unit: meatItem.unit,
          unitPrice: meatItem.costPerUnit,
          lineTotal: meatItem.costPerUnit * 20,
        },
      },
    },
    include: { lines: true },
  });

  await prisma.goodsReceipt.create({
    data: {
      locationId,
      poId: shortPo.id,
      vendor: "Budget Broadline Co",
      receivedAt: new Date(expectedShort.getTime() + 90 * 60000),
      notes: "scorecard-demo",
      lines: {
        create: {
          poLineId: shortPo.lines[0]!.id,
          inventoryItemId: meatItem.id,
          description: meatItem.name,
          qtyReceived: 14,
          unit: meatItem.unit,
          unitCost: meatItem.costPerUnit,
          orderedDescription: meatItem.name,
        },
      },
    },
  });
}

/** Multi-vendor quotes so cross-vendor bidding and AI have demo data */
async function seedVendorBiddingPrices(locationId: string) {
  const existing = await prisma.vendorPriceHistory.count({ where: { locationId } });
  if (existing > 3) return;

  const items = await prisma.inventoryItem.findMany({
    where: { locationId },
    take: 12,
    orderBy: { name: "asc" },
  });

  const produceVendors = [
    { vendor: "Green Valley Produce", factor: 1.0 },
    { vendor: "Hill Country Produce Co", factor: 0.94 },
    { vendor: "Austin Farm Direct", factor: 0.9 },
  ];

  const meatVendors = [
    { vendor: "Hill Country Meats", factor: 1.0 },
    { vendor: "Texas Prime Wholesale", factor: 0.97 },
    { vendor: "Central Texas Proteins", factor: 0.92 },
  ];

  for (const item of items) {
    const isProduce =
      /cabbage|jalape|mint|onion|produce|lettuce|tomato/i.test(item.name) ||
      item.supplier === "Green Valley Produce";
    const vendors = isProduce ? produceVendors : meatVendors;
    const base = item.costPerUnit;

    for (const v of vendors) {
      const exists = await prisma.vendorPriceHistory.findFirst({
        where: { locationId, vendor: v.vendor, itemName: item.name },
      });
      if (exists) continue;

      await prisma.vendorPriceHistory.create({
        data: {
          locationId,
          vendor: v.vendor,
          itemName: item.name,
          category: isProduce ? "Produce" : "Protein",
          unitPrice: Math.round(base * v.factor * 100) / 100,
          unit: item.unit,
        },
      });
    }
  }

  // Classic demo: yellow onions across three produce vendors
  const onionExists = await prisma.vendorPriceHistory.findFirst({
    where: { locationId, itemName: "Yellow onions (50 lb)" },
  });
  if (!onionExists) {
    const onionVendors = [
      { vendor: "Green Valley Produce", price: 28.5 },
      { vendor: "Hill Country Produce Co", price: 26.8 },
      { vendor: "Austin Farm Direct", price: 25.4 },
    ];
    for (const v of onionVendors) {
      await prisma.vendorPriceHistory.create({
        data: {
          locationId,
          vendor: v.vendor,
          itemName: "Yellow onions (50 lb)",
          category: "Produce",
          unitPrice: v.price,
          unit: "bag",
        },
      });
    }
  }
}
