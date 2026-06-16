import { prisma } from "@/lib/prisma";
import { sendVendorCreditRequestEmail } from "@/lib/email/vendor-mail";

export type CreditCategory = "DAMAGED" | "SPOILED" | "SHORT_SHIP" | "MISSING" | "OTHER";

export interface CreditMemoInput {
  vendor: string;
  amount: number;
  reason: string;
  category?: CreditCategory | null;
  invoiceId?: string | null;
  photoUrl?: string | null;
  reportedBy?: string | null;
  repEmail?: string | null;
  items?: Array<{ item: string; qty: number; unit: string }>;
}

function guessRepEmail(vendor: string) {
  const slug = vendor.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 24);
  return slug ? `rep@${slug}.orders` : "vendor-rep@supplier.local";
}

export async function lockInvoiceAccounting(
  invoiceId: string,
  reason: string
) {
  await prisma.vendorInvoice.update({
    where: { id: invoiceId },
    data: {
      accountingSyncLocked: true,
      paymentHoldReason: reason,
      matchStatus: "DISCREPANCY",
    },
  });
}

export async function maybeUnlockInvoiceAccounting(invoiceId: string) {
  const openCredits = await prisma.vendorCredit.count({
    where: { invoiceId, status: "OPEN" },
  });
  if (openCredits > 0) return false;

  await prisma.vendorInvoice.update({
    where: { id: invoiceId },
    data: {
      accountingSyncLocked: false,
      paymentHoldReason: null,
    },
  });
  return true;
}

export async function submitCreditMemoRequest(
  locationId: string,
  input: CreditMemoInput
) {
  const location = await prisma.location.findUnique({
    where: { id: locationId },
    select: { name: true },
  });

  let invoice: { id: string; invoiceNumber: string | null; vendor: string } | null = null;
  if (input.invoiceId) {
    invoice = await prisma.vendorInvoice.findFirst({
      where: { id: input.invoiceId, locationId },
      select: { id: true, invoiceNumber: true, vendor: true },
    });
  }

  const vendor = input.vendor.trim() || invoice?.vendor || "";
  const repEmail = (input.repEmail || guessRepEmail(vendor)).trim();

  const credit = await prisma.vendorCredit.create({
    data: {
      locationId,
      vendor,
      amount: input.amount,
      reason: input.reason,
      category: input.category ?? "DAMAGED",
      invoiceId: invoice?.id ?? null,
      photoUrl: input.photoUrl ?? null,
      reportedBy: input.reportedBy ?? null,
      repEmail,
      itemsJson: input.items ? JSON.stringify(input.items) : null,
      status: "OPEN",
      accountingLocked: Boolean(invoice),
      emailStatus: "PENDING",
    },
    include: { invoice: true },
  });

  const emailResult = await sendVendorCreditRequestEmail({
    locationId,
    creditId: credit.id,
    to: repEmail,
    vendor,
    amount: input.amount,
    reason: input.reason,
    category: input.category,
    photoUrl: input.photoUrl,
    invoiceNumber: invoice?.invoiceNumber,
    locationName: location?.name,
  });

  await prisma.vendorCredit.update({
    where: { id: credit.id },
    data: {
      emailStatus: emailResult.status,
      emailSentAt: emailResult.status === "SENT" || emailResult.status === "DEMO" ? new Date() : null,
    },
  });

  if (invoice) {
    await lockInvoiceAccounting(
      invoice.id,
      `Pending credit memo $${input.amount.toFixed(2)} — ${input.reason}`
    );
    const { runThreeWayMatch } = await import("./three-way-match");
    await runThreeWayMatch(invoice.id).catch(() => undefined);
  }

  await prisma.businessInsight.create({
    data: {
      locationId,
      title: `Credit memo pending: ${vendor}`,
      description: `$${input.amount.toFixed(2)} credit for ${input.reason}. Accounting sync locked${invoice ? ` on invoice ${invoice.invoiceNumber ?? invoice.id.slice(-6)}` : ""} until vendor applies memo.`,
      category: "FINANCE",
      severity: input.amount >= 100 ? "HIGH" : "MEDIUM",
      actionable: `Follow up with ${repEmail} — bookkeeper should not pay full invoice until credit is applied.`,
      dataSnapshot: JSON.stringify({
        creditId: credit.id,
        amount: input.amount,
        vendor,
        invoiceId: invoice?.id,
        accountingLocked: Boolean(invoice),
      }),
    },
  });

  await prisma.activityLog.create({
    data: {
      locationId,
      action: "CREDIT_MEMO_REQUEST",
      entity: "vendor_credit",
      entityId: credit.id,
      details: `Credit request: ${vendor} $${input.amount.toFixed(2)} — emailed ${repEmail} (${emailResult.status})`,
    },
  });

  return {
    credit,
    email: emailResult,
    accountingLocked: Boolean(invoice),
    repEmail,
  };
}

export async function applyCreditMemo(
  locationId: string,
  creditId: string,
  opts?: { creditMemoNo?: string }
) {
  const credit = await prisma.vendorCredit.findFirst({
    where: { id: creditId, locationId },
  });
  if (!credit) throw new Error("Credit not found");

  const updated = await prisma.vendorCredit.update({
    where: { id: creditId },
    data: {
      status: "APPLIED",
      resolvedAt: new Date(),
      creditMemoNo: opts?.creditMemoNo ?? credit.creditMemoNo,
      accountingLocked: false,
    },
  });

  if (credit.invoiceId) {
    await maybeUnlockInvoiceAccounting(credit.invoiceId);
    const { runThreeWayMatch } = await import("./three-way-match");
    await runThreeWayMatch(credit.invoiceId).catch(() => undefined);
  }

  await prisma.activityLog.create({
    data: {
      locationId,
      action: "CREDIT_MEMO_APPLIED",
      entity: "vendor_credit",
      entityId: creditId,
      details: `Credit memo applied: ${credit.vendor} $${credit.amount.toFixed(2)}`,
    },
  });

  return updated;
}

export async function getCreditMemoSummary(locationId: string) {
  const credits = await prisma.vendorCredit.findMany({
    where: { locationId },
    include: { invoice: { select: { invoiceNumber: true, amount: true, accountingSyncLocked: true } } },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const open = credits.filter((c) => c.status === "OPEN");
  const lockedInvoices = await prisma.vendorInvoice.findMany({
    where: { locationId, accountingSyncLocked: true },
    select: { id: true, vendor: true, invoiceNumber: true, amount: true, paymentHoldReason: true },
  });

  const ytdApplied = credits
    .filter((c) => c.status === "APPLIED")
    .reduce((s, c) => s + c.amount, 0);

  return {
    openCount: open.length,
    openTotal: open.reduce((s, c) => s + c.amount, 0),
    appliedYtdTotal: ytdApplied,
    accountingLockedCount: lockedInvoices.length,
    lockedInvoiceExposure: lockedInvoices.reduce((s, i) => s + i.amount, 0),
    lockedInvoices: lockedInvoices.slice(0, 8).map((i) => ({
      vendor: i.vendor,
      invoiceNumber: i.invoiceNumber,
      amount: i.amount,
      reason: i.paymentHoldReason,
    })),
    recentOpen: open.slice(0, 6).map((c) => ({
      id: c.id,
      vendor: c.vendor,
      amount: c.amount,
      reason: c.reason,
      category: c.category,
      emailStatus: c.emailStatus,
      repEmail: c.repEmail,
      photoUrl: c.photoUrl,
      invoiceNumber: c.invoice?.invoiceNumber,
      createdAt: c.createdAt.toISOString(),
    })),
  };
}
