import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSecureAuth } from "@/lib/api-auth";
import { getVerifiedOwnerLocationId } from "@/lib/billing-auth";
import { privateJsonResponse } from "@/lib/secure-response";
import { ACCOUNTING_PROVIDERS, VENDOR_EDI_PROVIDERS } from "@/lib/integrations/providers";
import { ensureIntegrationSettings } from "@/lib/integrations/pos-sync";
import type { AccountingProvider, VendorEdiProvider } from "@prisma/client";

export async function GET(request: NextRequest) {
  const { user, error } = await requireSecureAuth(request);
  if (error) return error;

  const { locationId, error: locError } = await getVerifiedOwnerLocationId(user!);
  const activeLocationId = locationId ?? user!.locationId;
  if (!activeLocationId) {
    return privateJsonResponse({ error: "No location assigned" }, { status: 404 });
  }

  const canManage = Boolean(locationId);
  const settings = await ensureIntegrationSettings(activeLocationId);

  const accountingConns = await prisma.accountingConnection.findMany({
    where: { locationId: activeLocationId },
  });
  const vendorConns = await prisma.vendorEdiConnection.findMany({
    where: { locationId: activeLocationId },
  });
  const recentJournal = await prisma.accountingJournalEntry.findMany({
    where: { locationId: activeLocationId },
    orderBy: { syncedAt: "desc" },
    take: 8,
  });
  const recentOrders = await prisma.vendorPurchaseOrder.findMany({
    where: { locationId: activeLocationId },
    orderBy: { submittedAt: "desc" },
    take: 5,
  });

  const { getCreditMemoSummary } = await import("@/lib/purchasing/credit-memo");
  const creditMemoSummary = await getCreditMemoSummary(activeLocationId);

  const outOfStockByProvider: Record<string, number> = {};
  for (const conn of vendorConns) {
    outOfStockByProvider[conn.provider] = await prisma.vendorCatalogItem.count({
      where: { locationId: activeLocationId, provider: conn.provider, inStock: false },
    });
  }

  return privateJsonResponse({
    canManage,
    posSync: {
      enabled: settings.posSyncEnabled,
      lastSyncAt: settings.lastPosSyncAt?.toISOString() ?? null,
      depletionsToday: settings.posDepletionsToday,
    },
    accounting: {
      providers: ACCOUNTING_PROVIDERS.map((p) => {
        const conn = accountingConns.find((c) => c.provider === p.id);
        return {
          ...p,
          connected: conn?.connected ?? false,
          companyName: conn?.companyName ?? null,
          autoSyncEnabled: conn?.autoSyncEnabled ?? true,
          lastSyncAt: conn?.lastSyncAt?.toISOString() ?? null,
          entriesSynced: conn?.entriesSynced ?? 0,
          lastSyncStatus: conn?.lastSyncStatus ?? null,
          lastSyncMessage: conn?.lastSyncMessage ?? null,
        };
      }),
      recentEntries: recentJournal.map((e) => ({
        id: e.id,
        provider: e.provider,
        entryType: e.entryType,
        reference: e.reference,
        description: e.description,
        debit: e.debit,
        credit: e.credit,
        syncedAt: e.syncedAt.toISOString(),
      })),
      creditMemoLocks: {
        openCredits: creditMemoSummary.openCount,
        openCreditTotal: creditMemoSummary.openTotal,
        lockedInvoices: creditMemoSummary.accountingLockedCount,
        lockedExposure: creditMemoSummary.lockedInvoiceExposure,
        invoices: creditMemoSummary.lockedInvoices,
      },
    },
    vendorEdi: {
      providers: VENDOR_EDI_PROVIDERS.map((p) => {
        const conn = vendorConns.find((c) => c.provider === p.id);
        return {
          ...p,
          connected: conn?.connected ?? false,
          accountNumber: conn?.accountNumber ?? null,
          warehouseCode: conn?.warehouseCode ?? null,
          catalogItems: conn?.catalogItemsCount ?? 0,
          outOfStock: outOfStockByProvider[p.id] ?? 0,
          lastCatalogSyncAt: conn?.lastCatalogSyncAt?.toISOString() ?? null,
          lastOrderAt: conn?.lastOrderAt?.toISOString() ?? null,
          lastSyncStatus: conn?.lastSyncStatus ?? null,
        };
      }),
      recentOrders: recentOrders.map((o) => ({
        id: o.id,
        provider: o.provider,
        status: o.status,
        lineCount: o.lineCount,
        totalAmount: o.totalAmount,
        submittedAt: o.submittedAt.toISOString(),
      })),
    },
  });
}

export async function PATCH(request: NextRequest) {
  const { user, error } = await requireSecureAuth(request);
  if (error) return error;

  const { locationId, error: locError } = await getVerifiedOwnerLocationId(user!);
  if (locError) return locError;

  const body = await request.json();
  if (typeof body.posSyncEnabled === "boolean") {
    await ensureIntegrationSettings(locationId!);
    await prisma.integrationSettings.update({
      where: { locationId: locationId! },
      data: { posSyncEnabled: body.posSyncEnabled },
    });
  }

  return privateJsonResponse({ message: "Integration settings updated" });
}

function parseAccountingProvider(value: unknown): AccountingProvider | null {
  if (value === "QUICKBOOKS" || value === "XERO" || value === "SAGE") return value;
  return null;
}

function parseVendorProvider(value: unknown): VendorEdiProvider | null {
  if (value === "SYSCO" || value === "US_FOODS" || value === "GORDON_FOOD_SERVICE") return value;
  return null;
}

export async function POST(request: NextRequest) {
  const { user, error } = await requireSecureAuth(request);
  if (error) return error;

  const { locationId, error: locError } = await getVerifiedOwnerLocationId(user!);
  if (locError) return locError;

  const body = await request.json();
  const action = body.action as string;

  try {
    if (action === "accounting_connect") {
      const provider = parseAccountingProvider(body.provider);
      if (!provider) return privateJsonResponse({ error: "Invalid accounting provider" }, { status: 400 });
      const { connectAccountingProvider } = await import("@/lib/integrations/accounting");
      const conn = await connectAccountingProvider(locationId!, provider, body.companyName);
      return privateJsonResponse({ message: `Connected to ${conn.companyName}`, connection: conn });
    }

    if (action === "accounting_disconnect") {
      const provider = parseAccountingProvider(body.provider);
      if (!provider) return privateJsonResponse({ error: "Invalid accounting provider" }, { status: 400 });
      const { disconnectAccountingProvider } = await import("@/lib/integrations/accounting");
      await disconnectAccountingProvider(locationId!, provider);
      return privateJsonResponse({ message: "Accounting integration disconnected" });
    }

    if (action === "accounting_sync") {
      const provider = parseAccountingProvider(body.provider);
      if (!provider) return privateJsonResponse({ error: "Invalid accounting provider" }, { status: 400 });
      const { syncAccountingToProvider } = await import("@/lib/integrations/accounting");
      const result = await syncAccountingToProvider(locationId!, provider);
      return privateJsonResponse(result);
    }

    if (action === "vendor_connect") {
      const provider = parseVendorProvider(body.provider);
      if (!provider) return privateJsonResponse({ error: "Invalid vendor EDI provider" }, { status: 400 });
      const { connectVendorEdi } = await import("@/lib/integrations/vendor-edi");
      const conn = await connectVendorEdi(locationId!, provider, body.accountNumber);
      return privateJsonResponse({ message: `Connected to ${provider}`, connection: conn });
    }

    if (action === "vendor_disconnect") {
      const provider = parseVendorProvider(body.provider);
      if (!provider) return privateJsonResponse({ error: "Invalid vendor EDI provider" }, { status: 400 });
      const { disconnectVendorEdi } = await import("@/lib/integrations/vendor-edi");
      await disconnectVendorEdi(locationId!, provider);
      return privateJsonResponse({ message: "Vendor EDI disconnected" });
    }

    if (action === "vendor_sync_catalog") {
      const provider = parseVendorProvider(body.provider);
      if (!provider) return privateJsonResponse({ error: "Invalid vendor EDI provider" }, { status: 400 });
      const { syncVendorCatalog } = await import("@/lib/integrations/vendor-edi");
      const result = await syncVendorCatalog(locationId!, provider);
      return privateJsonResponse(result);
    }

    if (action === "vendor_submit_order") {
      const provider = parseVendorProvider(body.provider);
      if (!provider) return privateJsonResponse({ error: "Invalid vendor EDI provider" }, { status: 400 });
      const { submitVendorPurchaseOrder } = await import("@/lib/integrations/vendor-edi");
      const result = await submitVendorPurchaseOrder(locationId!, provider);
      return privateJsonResponse(result);
    }

    return privateJsonResponse({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return privateJsonResponse(
      { error: err instanceof Error ? err.message : "Integration action failed" },
      { status: 400 }
    );
  }
}
