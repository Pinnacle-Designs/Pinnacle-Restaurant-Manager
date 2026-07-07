import { prisma } from "@/lib/prisma";

export type MatchDiscrepancyType =
  | "short_ship"
  | "overbill"
  | "price_variance"
  | "qty_mismatch"
  | "total_mismatch"
  | "missing_po"
  | "missing_receipt";

export interface MatchDiscrepancy {
  type: MatchDiscrepancyType;
  field: string;
  description: string;
  itemName?: string;
  poValue?: string;
  receivedValue?: string;
  invoiceValue?: string;
  severity: "LOW" | "MEDIUM" | "HIGH";
  /** Estimated dollars at risk if invoice is paid as-is */
  exposureAmount?: number;
}

export interface ThreeWayMatchLine {
  description: string;
  poQty: number | null;
  receivedQty: number | null;
  invoiceQty: number | null;
  unit: string;
  poUnitPrice: number | null;
  invoiceUnitPrice: number | null;
  status: "MATCHED" | "DISCREPANCY" | "PENDING";
}

export interface ThreeWayMatchResult {
  status: "MATCHED" | "DISCREPANCY" | "PENDING";
  discrepancies: MatchDiscrepancy[];
  lines: ThreeWayMatchLine[];
  summary: string;
  payRecommendation: "APPROVE" | "HOLD" | "INCOMPLETE";
  exposureTotal: number;
}

function lineKey(description: string, inventoryItemId?: string | null) {
  return inventoryItemId ?? description.toLowerCase().trim();
}

function findPoLine(
  poLines: { inventoryItemId: string | null; description: string; qtyOrdered: number; unit: string; unitPrice: number }[],
  invLine: { inventoryItemId: string | null; description: string }
) {
  return poLines.find(
    (pl) =>
      (invLine.inventoryItemId && pl.inventoryItemId === invLine.inventoryItemId) ||
      pl.description.toLowerCase() === invLine.description.toLowerCase()
  );
}

function findRecLine(
  recLines: { inventoryItemId: string | null; description: string; qtyReceived: number; unit: string; unitCost: number }[],
  invLine: { inventoryItemId: string | null; description: string }
) {
  return recLines.find(
    (rl) =>
      (invLine.inventoryItemId && rl.inventoryItemId === invLine.inventoryItemId) ||
      rl.description.toLowerCase() === invLine.description.toLowerCase()
  );
}

export async function runThreeWayMatch(invoiceId: string): Promise<ThreeWayMatchResult> {
  const invoice = await prisma.vendorInvoice.findUnique({
    where: { id: invoiceId },
    include: {
      lines: true,
      po: { include: { lines: true } },
      receipt: { include: { lines: true } },
    },
  });

  if (!invoice) throw new Error("Invoice not found");

  const discrepancies: MatchDiscrepancy[] = [];
  const matchLines: ThreeWayMatchLine[] = [];

  if (!invoice.poId) {
    return finalizeMatch(invoiceId, null, {
      status: "PENDING",
      discrepancies: [
        {
          type: "missing_po",
          field: "po",
          description: "No purchase order linked — cannot verify what was ordered.",
          severity: "MEDIUM",
        },
      ],
      lines: [],
      summary: "Link a PO to complete three-way matching.",
      payRecommendation: "INCOMPLETE",
      exposureTotal: 0,
    });
  }

  const po = invoice.po!;
  const receipt = invoice.receipt;
  const receiptLines = receipt?.lines ?? [];

  if (!receipt) {
    discrepancies.push({
      type: "missing_receipt",
      field: "receipt",
      description: "No receiving log linked — cannot verify what came off the truck.",
      severity: "MEDIUM",
    });
  }

  const poTotal = po.totalAmount;
  const invoiceTotal = invoice.amount;
  const receiptTotal = receiptLines.reduce((s, l) => s + l.qtyReceived * l.unitCost, 0);

  if (Math.abs(poTotal - invoiceTotal) > 0.02) {
    const diff = Math.abs(poTotal - invoiceTotal);
    discrepancies.push({
      type: "total_mismatch",
      field: "total",
      description: "Invoice total differs from PO total",
      poValue: `$${poTotal.toFixed(2)}`,
      invoiceValue: `$${invoiceTotal.toFixed(2)}`,
      severity: diff > poTotal * 0.05 ? "HIGH" : "MEDIUM",
      exposureAmount: Math.max(0, invoiceTotal - poTotal),
    });
  }

  if (receipt && Math.abs(receiptTotal - invoiceTotal) > 0.02) {
    const diff = invoiceTotal - receiptTotal;
    discrepancies.push({
      type: "total_mismatch",
      field: "total",
      description: "Invoice total differs from receiving log value",
      receivedValue: `$${receiptTotal.toFixed(2)}`,
      invoiceValue: `$${invoiceTotal.toFixed(2)}`,
      severity: "HIGH",
      exposureAmount: Math.max(0, diff),
    });
  }

  const seenKeys = new Set<string>();

  for (const invLine of invoice.lines) {
    const key = lineKey(invLine.description, invLine.inventoryItemId);
    seenKeys.add(key);

    const poLine = findPoLine(po.lines, invLine);
    const recLine = findRecLine(receiptLines, invLine);
    const poQty = poLine?.qtyOrdered ?? null;
    const receivedQty = recLine?.qtyReceived ?? null;
    const invoiceQty = invLine.qty;

    let lineStatus: ThreeWayMatchLine["status"] = "MATCHED";

    if (poLine && Math.abs(poLine.unitPrice - invLine.unitPrice) > 0.02) {
      lineStatus = "DISCREPANCY";
      const exposure = (invLine.unitPrice - poLine.unitPrice) * invLine.qty;
      discrepancies.push({
        type: "price_variance",
        field: "price",
        itemName: invLine.description,
        description: `${invLine.description}: PO price vs invoice price`,
        poValue: `$${poLine.unitPrice.toFixed(2)}`,
        invoiceValue: `$${invLine.unitPrice.toFixed(2)}`,
        severity: "HIGH",
        exposureAmount: Math.max(0, exposure),
      });
    }

    // Short-ship: received less than ordered
    if (poLine && receivedQty !== null && receivedQty + 0.01 < poLine.qtyOrdered) {
      lineStatus = "DISCREPANCY";
      const shortQty = poLine.qtyOrdered - receivedQty;
      discrepancies.push({
        type: "short_ship",
        field: "qty",
        itemName: invLine.description,
        description: `${invLine.description}: short-shipped ${shortQty.toFixed(1)} ${poLine.unit} (ordered ${poLine.qtyOrdered}, received ${receivedQty})`,
        poValue: `${poLine.qtyOrdered} ${poLine.unit}`,
        receivedValue: `${receivedQty} ${poLine.unit}`,
        invoiceValue: `${invoiceQty} ${invLine.unit}`,
        severity: "HIGH",
      });
    }

    // Not received at all but billed
    if (poLine && receivedQty === null && invoiceQty > 0) {
      lineStatus = "DISCREPANCY";
      const exposure = invLine.lineTotal;
      discrepancies.push({
        type: "overbill",
        field: "qty",
        itemName: invLine.description,
        description: `${invLine.description}: billed on invoice but nothing recorded on receiving log`,
        poValue: `${poLine.qtyOrdered} ${poLine.unit} ordered`,
        receivedValue: "0",
        invoiceValue: `${invoiceQty} ${invLine.unit}`,
        severity: "HIGH",
        exposureAmount: exposure,
      });
    }

    // Overbill: invoice qty exceeds received (classic short-ship + full charge)
    if (recLine && invoiceQty > recLine.qtyReceived + 0.01) {
      lineStatus = "DISCREPANCY";
      const overQty = invoiceQty - recLine.qtyReceived;
      const exposure = overQty * invLine.unitPrice;
      discrepancies.push({
        type: "overbill",
        field: "qty",
        itemName: invLine.description,
        description: `${invLine.description}: vendor charged for ${overQty.toFixed(1)} ${invLine.unit} not received (classic short-ship overbill)`,
        receivedValue: `${recLine.qtyReceived} ${recLine.unit}`,
        invoiceValue: `${invoiceQty} ${invLine.unit}`,
        severity: "HIGH",
        exposureAmount: exposure,
      });
    }

    // Invoice qty vs PO ordered (without receipt context)
    if (poLine && Math.abs(poLine.qtyOrdered - invLine.qty) > 0.01 && !recLine) {
      lineStatus = "DISCREPANCY";
      discrepancies.push({
        type: "qty_mismatch",
        field: "qty",
        itemName: invLine.description,
        description: `${invLine.description}: ordered vs billed qty`,
        poValue: `${poLine.qtyOrdered} ${poLine.unit}`,
        invoiceValue: `${invLine.qty} ${invLine.unit}`,
        severity: "HIGH",
      });
    }

    matchLines.push({
      description: invLine.description,
      poQty,
      receivedQty,
      invoiceQty,
      unit: invLine.unit,
      poUnitPrice: poLine?.unitPrice ?? null,
      invoiceUnitPrice: invLine.unitPrice,
      status: lineStatus,
    });
  }

  // PO lines never billed — informational only
  for (const poLine of po.lines) {
    const key = lineKey(poLine.description, poLine.inventoryItemId);
    if (seenKeys.has(key)) continue;
    const recLine = findRecLine(receiptLines, poLine);
    matchLines.push({
      description: poLine.description,
      poQty: poLine.qtyOrdered,
      receivedQty: recLine?.qtyReceived ?? null,
      invoiceQty: null,
      unit: poLine.unit,
      poUnitPrice: poLine.unitPrice,
      invoiceUnitPrice: null,
      status: recLine ? "PENDING" : "DISCREPANCY",
    });
  }

  const exposureTotal = discrepancies.reduce((s, d) => s + (d.exposureAmount ?? 0), 0);
  const hasHigh = discrepancies.some((d) => d.severity === "HIGH");

  const openCredits = await prisma.vendorCredit.findMany({
    where: { invoiceId, status: "OPEN" },
  });
  if (openCredits.length > 0) {
    const creditTotal = openCredits.reduce((s, c) => s + c.amount, 0);
    discrepancies.push({
      type: "qty_mismatch",
      field: "credit_memo",
      description: `${openCredits.length} open credit memo(s) — $${creditTotal.toFixed(2)} pending. Do not pay full invoice until vendor applies credit.`,
      severity: "HIGH",
      exposureAmount: creditTotal,
    });
  }

  const status: ThreeWayMatchResult["status"] =
    discrepancies.length === 0 ? "MATCHED" : "DISCREPANCY";
  const payRecommendation: ThreeWayMatchResult["payRecommendation"] =
    openCredits.length > 0
      ? "HOLD"
      : status === "MATCHED"
        ? "APPROVE"
        : !receipt || discrepancies.some((d) => d.type === "missing_po")
          ? "INCOMPLETE"
          : "HOLD";

  const summary =
    openCredits.length > 0
      ? `Hold payment — $${openCredits.reduce((s, c) => s + c.amount, 0).toFixed(2)} in pending vendor credits.`
      : status === "MATCHED"
        ? "PO, receiving log, and invoice align — safe to pay."
        : payRecommendation === "HOLD"
          ? `${discrepancies.length} discrepanc${discrepancies.length === 1 ? "y" : "ies"} — hold payment ($${exposureTotal.toFixed(2)} at risk).`
          : `${discrepancies.length} issue(s) — complete PO/receipt links before paying.`;

  return finalizeMatch(invoiceId, invoice.poId, {
    status,
    discrepancies,
    lines: matchLines,
    summary,
    payRecommendation,
    exposureTotal: Math.round(exposureTotal * 100) / 100,
  });
}

async function finalizeMatch(
  invoiceId: string,
  poId: string | null | undefined,
  result: ThreeWayMatchResult
): Promise<ThreeWayMatchResult> {
  await prisma.vendorInvoice.update({
    where: { id: invoiceId },
    data: {
      matchStatus: result.status,
      matchNotes: JSON.stringify(result.discrepancies),
    },
  });

  if (poId) {
    await prisma.vendorPurchaseOrder.update({
      where: { id: poId },
      data: { matchStatus: result.status },
    });
  }

  return result;
}

export async function rematchInvoicesForPo(poId: string) {
  const invoices = await prisma.vendorInvoice.findMany({ where: { poId } });
  const results = [];
  for (const inv of invoices) {
    results.push(await runThreeWayMatch(inv.id));
  }
  return results;
}

export interface ThreeWayMatchSummary {
  invoiceId: string;
  vendor: string;
  invoiceNumber: string | null;
  amount: number;
  matchStatus: string;
  payRecommendation: string;
  exposureTotal: number;
  discrepancyCount: number;
  summary: string;
  topIssue: string | null;
}

export async function getThreeWayMatchSummary(locationId: string): Promise<{
  invoices: ThreeWayMatchSummary[];
  discrepancyCount: number;
  holdPaymentTotal: number;
  pendingCount: number;
  matchedCount: number;
}> {
  const invoices = await prisma.vendorInvoice.findMany({
    where: { locationId },
    orderBy: { invoiceDate: "desc" },
    take: 40,
  });

  const openCreditsByInvoice = await prisma.vendorCredit.groupBy({
    by: ["invoiceId"],
    where: { locationId, status: "OPEN", invoiceId: { not: null } },
    _sum: { amount: true },
    _count: { _all: true },
  });
  const creditMap = new Map(
    openCreditsByInvoice.map((r) => [r.invoiceId!, { total: r._sum.amount ?? 0, count: r._count._all }])
  );

  const summaries: ThreeWayMatchSummary[] = invoices.map((inv) => {
    let discrepancies: MatchDiscrepancy[] = [];
    try {
      if (inv.matchNotes) discrepancies = JSON.parse(inv.matchNotes);
    } catch {
      /* ignore */
    }
    const exposureTotal = discrepancies.reduce((s, d) => s + (d.exposureAmount ?? 0), 0);
    const pendingCredit = creditMap.get(inv.id);
    const payRecommendation =
      inv.accountingSyncLocked || pendingCredit
        ? "HOLD"
        : inv.matchStatus === "MATCHED"
          ? "APPROVE"
          : inv.matchStatus === "PENDING"
            ? "INCOMPLETE"
            : "HOLD";

    return {
      invoiceId: inv.id,
      vendor: inv.vendor,
      invoiceNumber: inv.invoiceNumber,
      amount: inv.amount,
      matchStatus: inv.matchStatus,
      payRecommendation,
      exposureTotal: Math.round(exposureTotal * 100) / 100,
      discrepancyCount: discrepancies.length,
      summary:
        inv.matchStatus === "MATCHED"
          ? "PO, receipt, and invoice align."
          : discrepancies[0]?.description ?? "Review required.",
      topIssue: discrepancies[0]?.description ?? null,
    };
  });

  return {
    invoices: summaries,
    discrepancyCount: summaries.filter((s) => s.matchStatus === "DISCREPANCY").length,
    holdPaymentTotal: summaries
      .filter((s) => s.payRecommendation === "HOLD")
      .reduce((s, i) => s + i.exposureTotal, 0),
    pendingCount: summaries.filter((s) => s.matchStatus === "PENDING").length,
    matchedCount: summaries.filter((s) => s.matchStatus === "MATCHED").length,
  };
}

export async function getThreeWayMatchDetail(invoiceId: string, locationId: string) {
  const invoice = await prisma.vendorInvoice.findFirst({
    where: { id: invoiceId, locationId },
    include: {
      lines: true,
      po: { include: { lines: true } },
      receipt: { include: { lines: true } },
    },
  });
  if (!invoice) return null;

  const match = await runThreeWayMatch(invoiceId);

  return {
    invoice: {
      id: invoice.id,
      vendor: invoice.vendor,
      invoiceNumber: invoice.invoiceNumber,
      amount: invoice.amount,
      invoiceDate: invoice.invoiceDate.toISOString(),
      poId: invoice.poId,
      receiptId: invoice.receiptId,
      imageUrl: invoice.imageUrl,
      lines: invoice.lines.map((l) => ({
        description: l.description,
        qty: l.qty,
        unit: l.unit,
        unitPrice: l.unitPrice,
        lineTotal: l.lineTotal,
        sku: l.sku,
      })),
    },
    po: invoice.po
      ? {
          id: invoice.po.id,
          poNumber: invoice.po.poNumber,
          totalAmount: invoice.po.totalAmount,
          lines: invoice.po.lines.map((l) => ({
            description: l.description,
            qtyOrdered: l.qtyOrdered,
            qtyReceived: l.qtyReceived,
            unit: l.unit,
            unitPrice: l.unitPrice,
          })),
        }
      : null,
    receipt: invoice.receipt
      ? {
          id: invoice.receipt.id,
          vendor: invoice.receipt.vendor,
          lines: invoice.receipt.lines.map((l) => ({
            description: l.description,
            qtyReceived: l.qtyReceived,
            unit: l.unit,
            unitCost: l.unitCost,
          })),
        }
      : null,
    match,
    discrepancies: match.discrepancies,
  };
}
