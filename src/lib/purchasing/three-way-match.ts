import { prisma } from "@/lib/prisma";

export interface MatchDiscrepancy {
  field: string;
  description: string;
  poValue?: string;
  receivedValue?: string;
  invoiceValue?: string;
  severity: "LOW" | "MEDIUM" | "HIGH";
}

export interface ThreeWayMatchResult {
  status: "MATCHED" | "DISCREPANCY" | "PENDING";
  discrepancies: MatchDiscrepancy[];
  summary: string;
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

  if (!invoice.poId) {
    return {
      status: "PENDING",
      discrepancies: [{ field: "po", description: "No purchase order linked", severity: "MEDIUM" }],
      summary: "Link a PO to complete three-way matching.",
    };
  }

  const po = invoice.po!;
  const receipt = invoice.receipt;

  // Total amount check
  const poTotal = po.totalAmount;
  const invoiceTotal = invoice.amount;
  const receiptTotal = receipt?.lines.reduce((s, l) => s + l.qtyReceived * l.unitCost, 0) ?? 0;

  if (Math.abs(poTotal - invoiceTotal) > 0.02) {
    discrepancies.push({
      field: "total",
      description: "Invoice total differs from PO",
      poValue: `$${poTotal.toFixed(2)}`,
      invoiceValue: `$${invoiceTotal.toFixed(2)}`,
      severity: Math.abs(poTotal - invoiceTotal) > poTotal * 0.05 ? "HIGH" : "MEDIUM",
    });
  }

  if (receipt && Math.abs(receiptTotal - invoiceTotal) > 0.02) {
    discrepancies.push({
      field: "total",
      description: "Invoice total differs from receiving log",
      receivedValue: `$${receiptTotal.toFixed(2)}`,
      invoiceValue: `$${invoiceTotal.toFixed(2)}`,
      severity: "HIGH",
    });
  }

  // Line-level qty and price checks
  for (const invLine of invoice.lines) {
    const poLine = po.lines.find(
      (pl) =>
        pl.inventoryItemId === invLine.inventoryItemId ||
        pl.description.toLowerCase() === invLine.description.toLowerCase()
    );
    const recLine = receipt?.lines.find(
      (rl) =>
        rl.inventoryItemId === invLine.inventoryItemId ||
        rl.description.toLowerCase() === invLine.description.toLowerCase()
    );

    if (poLine) {
      if (Math.abs(poLine.qtyOrdered - invLine.qty) > 0.01) {
        discrepancies.push({
          field: "qty",
          description: `${invLine.description}: ordered vs billed qty`,
          poValue: `${poLine.qtyOrdered} ${poLine.unit}`,
          invoiceValue: `${invLine.qty} ${invLine.unit}`,
          receivedValue: recLine ? `${recLine.qtyReceived} ${recLine.unit}` : "—",
          severity: "HIGH",
        });
      }
      if (Math.abs(poLine.unitPrice - invLine.unitPrice) > 0.02) {
        discrepancies.push({
          field: "price",
          description: `${invLine.description}: PO price vs invoice price`,
          poValue: `$${poLine.unitPrice.toFixed(2)}`,
          invoiceValue: `$${invLine.unitPrice.toFixed(2)}`,
          severity: "HIGH",
        });
      }
    }

    if (recLine && Math.abs(recLine.qtyReceived - invLine.qty) > 0.01) {
      discrepancies.push({
        field: "qty",
        description: `${invLine.description}: received vs billed qty`,
        receivedValue: `${recLine.qtyReceived} ${recLine.unit}`,
        invoiceValue: `${invLine.qty} ${invLine.unit}`,
        severity: "HIGH",
      });
    }
  }

  const status = discrepancies.length === 0 ? "MATCHED" : "DISCREPANCY";
  const summary =
    status === "MATCHED"
      ? "PO, receiving log, and invoice all align."
      : `${discrepancies.length} discrepanc${discrepancies.length === 1 ? "y" : "ies"} found — review before paying.`;

  await prisma.vendorInvoice.update({
    where: { id: invoiceId },
    data: {
      matchStatus: status,
      matchNotes: JSON.stringify(discrepancies),
    },
  });

  if (invoice.poId) {
    await prisma.vendorPurchaseOrder.update({
      where: { id: invoice.poId },
      data: { matchStatus: status },
    });
  }

  return { status, discrepancies, summary };
}
