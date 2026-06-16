import { prisma } from "@/lib/prisma";
import { checkPriceSpikes, updateInventoryCostsFromInvoice } from "./price-alerts";
import { auditCatchWeight, persistCatchWeightInsights } from "./catch-weight";
import { runThreeWayMatch } from "./three-way-match";

export interface InvoiceLineInput {
  description: string;
  qty: number;
  unit: string;
  unitPrice: number;
  lineTotal: number;
  sku?: string | null;
  inventoryItemId?: string | null;
  catchWeightBilled?: number | null;
  catchWeightUnit?: string | null;
}

export async function resolveInvoiceLineInventoryIds(
  locationId: string,
  vendor: string,
  lines: InvoiceLineInput[]
): Promise<InvoiceLineInput[]> {
  const inventory = await prisma.inventoryItem.findMany({ where: { locationId } });

  return lines.map((line) => {
    if (line.inventoryItemId) return line;

    const desc = line.description.toLowerCase();
    const match = inventory.find((item) => {
      const name = item.name.toLowerCase();
      if (name === desc) return true;
      const firstWord = desc.split(/\s+/)[0];
      const itemFirst = name.split(/\s+/)[0];
      if (firstWord && itemFirst && firstWord.length > 3 && name.includes(firstWord)) return true;
      if (item.supplier === vendor && name.includes(desc.split(" ")[0] ?? "")) return true;
      return false;
    });

    return match ? { ...line, inventoryItemId: match.id } : line;
  });
}

export async function applyInvoiceInventoryQuantities(
  locationId: string,
  lines: InvoiceLineInput[],
  opts: { receiptLinked: boolean }
) {
  if (opts.receiptLinked) {
    return { itemsUpdated: 0, note: "Quantities already updated on receiving log" };
  }

  let itemsUpdated = 0;
  for (const line of lines) {
    if (!line.inventoryItemId) continue;

    const item = await prisma.inventoryItem.findFirst({
      where: { id: line.inventoryItemId, locationId },
    });
    if (!item) continue;

    const addQty =
      item.countByWeight && line.catchWeightBilled
        ? line.catchWeightBilled
        : item.unit.toLowerCase() === "lbs" && line.catchWeightBilled
          ? line.catchWeightBilled
          : line.qty;

    if (addQty <= 0) continue;

    await prisma.inventoryItem.update({
      where: { id: item.id },
      data: {
        quantity: item.quantity + addQty,
        lastRestocked: new Date(),
      },
    });
    itemsUpdated += 1;
  }

  return { itemsUpdated, note: itemsUpdated > 0 ? "Inventory quantities updated from invoice" : "" };
}

export async function logInvoiceExpense(
  locationId: string,
  params: {
    vendor: string;
    amount: number;
    invoiceNumber: string | null;
    invoiceDate: Date;
    imageUrl: string | null;
  }
) {
  const description = params.invoiceNumber
    ? `Vendor invoice ${params.invoiceNumber} — ${params.vendor}`
    : `Vendor invoice — ${params.vendor}`;

  const expense = await prisma.expense.create({
    data: {
      locationId,
      description,
      amount: params.amount,
      category: "Food & Supplies",
      date: params.invoiceDate,
      receiptUrl: params.imageUrl,
    },
  });

  return expense;
}

export async function processDigitizedInvoice(
  locationId: string,
  savedInvoice: {
    id: string;
    vendor: string;
    amount: number;
    invoiceNumber: string | null;
    invoiceDate: Date;
    imageUrl: string | null;
    poId: string | null;
    receiptId: string | null;
    lines: InvoiceLineInput[];
  }
) {
  const resolvedLines = await resolveInvoiceLineInventoryIds(
    locationId,
    savedInvoice.vendor,
    savedInvoice.lines
  );

  const receipt = savedInvoice.receiptId
    ? await prisma.goodsReceipt.findUnique({
        where: { id: savedInvoice.receiptId },
        include: { lines: true },
      })
    : null;

  const priceAlerts = await checkPriceSpikes(locationId, savedInvoice.vendor, resolvedLines);
  const recipesUpdated = await updateInventoryCostsFromInvoice(locationId, resolvedLines);
  const inventoryResult = await applyInvoiceInventoryQuantities(locationId, resolvedLines, {
    receiptLinked: Boolean(savedInvoice.receiptId),
  });

  const catchWeightAlerts = auditCatchWeight({
    invoiceLines: resolvedLines,
    receiptLines: receipt?.lines,
  });
  await persistCatchWeightInsights(locationId, savedInvoice.vendor, catchWeightAlerts);

  const match = await runThreeWayMatch(savedInvoice.id);

  const expense = await logInvoiceExpense(locationId, {
    vendor: savedInvoice.vendor,
    amount: savedInvoice.amount,
    invoiceNumber: savedInvoice.invoiceNumber,
    invoiceDate: savedInvoice.invoiceDate,
    imageUrl: savedInvoice.imageUrl,
  });

  await prisma.activityLog.create({
    data: {
      locationId,
      action: "INVOICE_OCR",
      entity: "vendor_invoice",
      entityId: savedInvoice.id,
      details: `Invoice digitized: ${savedInvoice.vendor} $${savedInvoice.amount.toFixed(2)} — ${resolvedLines.length} lines, ${priceAlerts.length} price alert(s), match ${match.status}`,
    },
  });

  return {
    priceAlerts,
    catchWeightAlerts,
    match,
    expenseId: expense.id,
    inventoryUpdated: inventoryResult.itemsUpdated,
    recipesUpdated,
    linesResolved: resolvedLines.length,
    pushNotifications: [
      ...priceAlerts
        .filter((a) => a.changePct >= 10)
        .map((a) => ({
          title: `Price spike: ${a.item}`,
          description: `${savedInvoice.vendor} raised ${a.item} +${a.changePct}% — recipe costs recalculated.`,
          severity: a.changePct >= 15 ? "CRITICAL" : "HIGH",
        })),
      ...catchWeightAlerts
        .filter((a) => a.severity === "HIGH")
        .map((a) => ({
          title: `Catch weight: ${a.itemName}`,
          description: a.description,
          severity: "HIGH" as const,
        })),
    ],
  };
}
