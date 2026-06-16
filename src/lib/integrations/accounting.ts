import { prisma } from "@/lib/prisma";
import type { AccountingProvider } from "@prisma/client";
import { accountingProviderLabel } from "./providers";

const GL_ACCOUNTS: Record<string, string> = {
  EXPENSE: "6100",
  INVOICE: "2000",
  INVENTORY: "1400",
  CREDIT: "2100",
};

function hasLiveCredentials(provider: AccountingProvider): boolean {
  if (provider === "QUICKBOOKS") return Boolean(process.env.QUICKBOOKS_CLIENT_ID);
  if (provider === "XERO") return Boolean(process.env.XERO_CLIENT_ID);
  if (provider === "SAGE") return Boolean(process.env.SAGE_CLIENT_ID);
  return false;
}

export async function connectAccountingProvider(
  locationId: string,
  provider: AccountingProvider,
  companyName?: string
) {
  const live = hasLiveCredentials(provider);
  const label = accountingProviderLabel(provider);

  return prisma.accountingConnection.upsert({
    where: { locationId_provider: { locationId, provider } },
    create: {
      locationId,
      provider,
      connected: true,
      companyName: companyName || `${label} — Demo Co.`,
      externalCompanyId: live ? undefined : `demo-${provider.toLowerCase()}`,
      autoSyncEnabled: true,
      lastSyncStatus: live ? "pending_oauth" : "demo",
      lastSyncMessage: live
        ? "OAuth credentials configured — complete authorization in provider portal."
        : "Connected in demo mode. Journal entries post to Pinnacle until API keys are added.",
    },
    update: {
      connected: true,
      companyName: companyName || undefined,
      lastSyncStatus: live ? "pending_oauth" : "demo",
      lastSyncMessage: live
        ? "Reconnect initiated."
        : "Reconnected in demo mode.",
    },
  });
}

export async function disconnectAccountingProvider(
  locationId: string,
  provider: AccountingProvider
) {
  return prisma.accountingConnection.update({
    where: { locationId_provider: { locationId, provider } },
    data: {
      connected: false,
      lastSyncStatus: "disconnected",
      lastSyncMessage: "Integration disconnected.",
    },
  });
}

export async function syncAccountingToProvider(locationId: string, provider: AccountingProvider) {
  const conn = await prisma.accountingConnection.findUnique({
    where: { locationId_provider: { locationId, provider } },
  });
  if (!conn?.connected) {
    throw new Error(`${accountingProviderLabel(provider)} is not connected`);
  }

  const existingSourceIds = new Set(
    (
      await prisma.accountingJournalEntry.findMany({
        where: { locationId, provider },
        select: { sourceId: true },
      })
    )
      .map((e) => e.sourceId)
      .filter(Boolean) as string[]
  );

  const entries: Array<{
    entryType: string;
    reference: string;
    description: string;
    debit: number;
    credit: number;
    accountCode: string;
    sourceId: string;
  }> = [];

  const expenses = await prisma.expense.findMany({
    where: { locationId },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  for (const exp of expenses) {
    const sourceId = `expense:${exp.id}`;
    if (existingSourceIds.has(sourceId)) continue;
    entries.push({
      entryType: "EXPENSE",
      reference: `EXP-${exp.id.slice(-6).toUpperCase()}`,
      description: exp.description,
      debit: exp.amount,
      credit: 0,
      accountCode: GL_ACCOUNTS.EXPENSE,
      sourceId,
    });
  }

  const invoices = await prisma.vendorInvoice.findMany({
    where: { locationId },
    orderBy: { invoiceDate: "desc" },
    take: 20,
  });
  for (const inv of invoices) {
    const sourceId = `invoice:${inv.id}`;
    if (existingSourceIds.has(sourceId)) continue;
    if (inv.accountingSyncLocked) continue;

    const openCredits = await prisma.vendorCredit.count({
      where: { invoiceId: inv.id, status: "OPEN" },
    });
    if (openCredits > 0) continue;

    entries.push({
      entryType: "INVOICE",
      reference: `AP-${inv.id.slice(-6).toUpperCase()}`,
      description: `${inv.vendor} — ${inv.category}`,
      debit: 0,
      credit: inv.amount,
      accountCode: GL_ACCOUNTS.INVOICE,
      sourceId,
    });
  }

  const inventory = await prisma.inventoryItem.findMany({ where: { locationId } });
  const inventoryValue = inventory.reduce(
    (sum, item) => sum + item.quantity * item.costPerUnit,
    0
  );
  const invSourceId = `inventory:${new Date().toISOString().slice(0, 10)}`;
  if (!existingSourceIds.has(invSourceId) && inventoryValue > 0) {
    entries.push({
      entryType: "INVENTORY_VALUE",
      reference: `INV-${new Date().toISOString().slice(0, 10)}`,
      description: `Ending inventory valuation (${inventory.length} SKUs)`,
      debit: Math.round(inventoryValue * 100) / 100,
      credit: 0,
      accountCode: GL_ACCOUNTS.INVENTORY,
      sourceId: invSourceId,
    });
  }

  const lockedInvoiceCount = await prisma.vendorInvoice.count({
    where: { locationId, accountingSyncLocked: true },
  });

  if (entries.length === 0) {
    await prisma.accountingConnection.update({
      where: { id: conn.id },
      data: {
        lastSyncAt: new Date(),
        lastSyncStatus: "ok",
        lastSyncMessage:
          lockedInvoiceCount > 0
            ? `No new entries — ${lockedInvoiceCount} invoice(s) held for pending credit memos.`
            : "Already up to date — no new journal entries.",
      },
    });
    return {
      entriesCreated: 0,
      message:
        lockedInvoiceCount > 0
          ? `${lockedInvoiceCount} invoice(s) blocked from accounting sync until credits are applied.`
          : "Already up to date.",
      lockedInvoiceCount,
    };
  }

  await prisma.accountingJournalEntry.createMany({
    data: entries.map((e) => ({
      locationId,
      provider,
      entryType: e.entryType,
      reference: e.reference,
      description: e.description,
      debit: e.debit,
      credit: e.credit,
      accountCode: e.accountCode,
      sourceId: e.sourceId,
    })),
  });

  await prisma.accountingConnection.update({
    where: { id: conn.id },
    data: {
      lastSyncAt: new Date(),
      entriesSynced: { increment: entries.length },
      lastSyncStatus: "ok",
      lastSyncMessage: `Posted ${entries.length} journal ${entries.length === 1 ? "entry" : "entries"} to ${accountingProviderLabel(provider)}.`,
    },
  });

  return {
    entriesCreated: entries.length,
    message: `Posted ${entries.length} journal entries.`,
    lockedInvoiceCount,
  };
}
