import { subDays } from "date-fns";
import type { VendorEdiProvider } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { VENDOR_EDI_PROVIDERS, vendorEdiProviderLabel } from "@/lib/integrations/providers";
import { generatePoSuggestions } from "./suggest-orders";

export interface VendorSummary {
  name: string;
  kind: "supplier" | "edi";
  ediProvider?: VendorEdiProvider;
  itemCount: number;
  lowStockCount: number;
  openPoCount: number;
  openPoTotal: number;
  suggestedLineCount: number;
  suggestedTotal: number;
  openCreditCount: number;
  openCreditTotal: number;
  spentLast90Days: number;
  connected?: boolean;
  accountNumber?: string | null;
  warehouseCode?: string | null;
  catalogItems?: number;
  outOfStock?: number;
  lastCatalogSyncAt?: string | null;
  lastOrderAt?: string | null;
  lastSyncStatus?: string | null;
}

const OPEN_PO_STATUSES = ["DRAFT", "SUGGESTED", "SUBMITTED", "PARTIALLY_RECEIVED"];

function vendorKey(kind: "supplier" | "edi", name: string, ediProvider?: VendorEdiProvider) {
  return kind === "edi" && ediProvider ? `edi:${ediProvider}` : `sup:${name.toLowerCase()}`;
}

export async function getVendorSummaries(locationId: string): Promise<VendorSummary[]> {
  const since = subDays(new Date(), 90);

  const [inventory, orders, credits, ediConns, suggestions, outOfStockCounts] = await Promise.all([
    prisma.inventoryItem.findMany({
      where: { locationId },
      select: { supplier: true, quantity: true, minQuantity: true },
    }),
    prisma.vendorPurchaseOrder.findMany({
      where: { locationId },
      select: {
        vendor: true,
        provider: true,
        status: true,
        totalAmount: true,
        submittedAt: true,
      },
    }),
    prisma.vendorCredit.findMany({
      where: { locationId },
      select: { vendor: true, status: true, amount: true },
    }),
    prisma.vendorEdiConnection.findMany({ where: { locationId } }),
    generatePoSuggestions(locationId),
    prisma.vendorCatalogItem.groupBy({
      by: ["provider"],
      where: { locationId, inStock: false },
      _count: { _all: true },
    }),
  ]);

  const outOfStockByProvider = new Map(
    outOfStockCounts.map((row) => [row.provider, row._count._all])
  );

  const map = new Map<string, VendorSummary>();

  const ensure = (
    name: string,
    kind: "supplier" | "edi",
    ediProvider?: VendorEdiProvider
  ): VendorSummary => {
    const key = vendorKey(kind, name, ediProvider);
    if (!map.has(key)) {
      map.set(key, {
        name,
        kind,
        ediProvider,
        itemCount: 0,
        lowStockCount: 0,
        openPoCount: 0,
        openPoTotal: 0,
        suggestedLineCount: 0,
        suggestedTotal: 0,
        openCreditCount: 0,
        openCreditTotal: 0,
        spentLast90Days: 0,
      });
    }
    return map.get(key)!;
  };

  for (const item of inventory) {
    const name = item.supplier?.trim();
    if (!name) continue;
    const v = ensure(name, "supplier");
    v.itemCount += 1;
    if (item.quantity <= item.minQuantity) v.lowStockCount += 1;
  }

  for (const po of orders) {
    const target =
      po.provider != null
        ? ensure(vendorEdiProviderLabel(po.provider), "edi", po.provider)
        : ensure(po.vendor?.trim() || "General Supplier", "supplier");

    if (OPEN_PO_STATUSES.includes(po.status)) {
      target.openPoCount += 1;
      target.openPoTotal += po.totalAmount;
    }
    if (po.submittedAt >= since && !["DRAFT", "CANCELLED"].includes(po.status)) {
      target.spentLast90Days += po.totalAmount;
    }
  }

  for (const credit of credits) {
    const name = credit.vendor.trim();
    if (!name) continue;
    const v = ensure(name, "supplier");
    if (credit.status === "OPEN") {
      v.openCreditCount += 1;
      v.openCreditTotal += credit.amount;
    }
  }

  for (const s of suggestions) {
    const v = ensure(s.vendor, "supplier");
    v.suggestedLineCount += 1;
    v.suggestedTotal += s.lineTotal;
  }

  for (const providerDef of VENDOR_EDI_PROVIDERS) {
    const conn = ediConns.find((c) => c.provider === providerDef.id);
    const v = ensure(providerDef.name, "edi", providerDef.id);
    v.connected = conn?.connected ?? false;
    v.accountNumber = conn?.accountNumber ?? null;
    v.warehouseCode = conn?.warehouseCode ?? null;
    v.catalogItems = conn?.catalogItemsCount ?? 0;
    v.outOfStock = outOfStockByProvider.get(providerDef.id) ?? 0;
    v.lastCatalogSyncAt = conn?.lastCatalogSyncAt?.toISOString() ?? null;
    v.lastOrderAt = conn?.lastOrderAt?.toISOString() ?? null;
    v.lastSyncStatus = conn?.lastSyncStatus ?? null;
  }

  return Array.from(map.values()).sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "edi" ? -1 : 1;
    if (b.suggestedTotal !== a.suggestedTotal) return b.suggestedTotal - a.suggestedTotal;
    return a.name.localeCompare(b.name);
  });
}
