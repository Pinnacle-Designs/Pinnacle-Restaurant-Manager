import { prisma } from "@/lib/prisma";
import {
  derivePoPaymentStatus,
  getPoReceivingGroup,
  paymentStatusDetail,
  type PoReceivingRow,
  type PoReceivingSummary,
} from "./po-receiving-status";

export type { PoReceivingRow, PoReceivingSummary };

export async function getPoReceivingSummary(locationId: string): Promise<PoReceivingSummary> {
  const [orders, openCredits] = await Promise.all([
    prisma.vendorPurchaseOrder.findMany({
      where: {
        locationId,
        status: { notIn: ["DRAFT", "CANCELLED"] },
      },
      include: { receipts: true, invoices: true },
      orderBy: { submittedAt: "desc" },
      take: 40,
    }),
    prisma.vendorCredit.findMany({
      where: { locationId, status: "OPEN", invoiceId: { not: null } },
      select: { invoiceId: true },
    }),
  ]);

  const lockedInvoiceIds = new Set(
    openCredits.map((c) => c.invoiceId).filter((id): id is string => Boolean(id))
  );

  const rows: PoReceivingRow[] = [];
  let pendingCount = 0;
  let receivedCount = 0;
  let pendingTotal = 0;
  let receivedTotal = 0;
  let paidCount = 0;
  let onHoldCount = 0;
  let awaitingInvoiceCount = 0;
  let approvedCount = 0;

  for (const po of orders) {
    const group = getPoReceivingGroup(po.status);
    if (!group) continue;

    const paymentStatus = derivePoPaymentStatus(po, lockedInvoiceIds);
    const paymentDetail = paymentStatusDetail(po, paymentStatus);

    if (group === "pending") {
      pendingCount++;
      pendingTotal += po.totalAmount;
    } else {
      receivedCount++;
      receivedTotal += po.totalAmount;
    }

    if (paymentStatus === "PAID") paidCount++;
    if (paymentStatus === "ON_HOLD") onHoldCount++;
    if (paymentStatus === "AWAITING_INVOICE") awaitingInvoiceCount++;
    if (paymentStatus === "APPROVED") approvedCount++;

    rows.push({
      id: po.id,
      poNumber: po.poNumber,
      vendor: po.vendor,
      status: po.status,
      totalAmount: po.totalAmount,
      receivingGroup: group,
      paymentStatus,
      paymentDetail,
      invoiceCount: po.invoices.length,
      receiptCount: po.receipts.length,
    });
  }

  return {
    pendingCount,
    receivedCount,
    pendingTotal,
    receivedTotal,
    paidCount,
    onHoldCount,
    awaitingInvoiceCount,
    approvedCount,
    orders: rows,
  };
}
