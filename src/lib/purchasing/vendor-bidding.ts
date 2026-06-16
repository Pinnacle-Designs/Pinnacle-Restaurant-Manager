import { prisma } from "@/lib/prisma";
import { vendorEdiProviderLabel } from "@/lib/integrations/providers";

export interface VendorPriceQuote {
  vendor: string;
  unitPrice: number;
  unit: string;
  source: "history" | "edi" | "inventory";
  inStock?: boolean;
}

export interface VendorBidLine {
  inventoryItemId: string;
  itemName: string;
  unit: string;
  currentVendor: string | null;
  currentPrice: number;
  suggestedQty: number;
  vendors: VendorPriceQuote[];
  recommendedVendor: string;
  recommendedPrice: number;
  savingsAmount: number;
  savingsPct: number;
}

function normalizeItemKey(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export async function getCrossVendorBids(
  locationId: string,
  opts?: { inventoryItemIds?: string[] }
): Promise<VendorBidLine[]> {
  const [inventory, priceHistory, catalogItems, ediConns] = await Promise.all([
    prisma.inventoryItem.findMany({
      where: {
        locationId,
        ...(opts?.inventoryItemIds?.length ? { id: { in: opts.inventoryItemIds } } : {}),
      },
      orderBy: { name: "asc" },
    }),
    prisma.vendorPriceHistory.findMany({
      where: { locationId },
      orderBy: { effectiveDate: "desc" },
    }),
    prisma.vendorCatalogItem.findMany({
      where: { locationId },
      include: { inventoryItem: true },
    }),
    prisma.vendorEdiConnection.findMany({ where: { locationId, connected: true } }),
  ]);

  const connectedProviders = new Set(ediConns.map((c) => c.provider));

  const historyByItem = new Map<string, VendorPriceQuote[]>();
  for (const row of priceHistory) {
    const key = normalizeItemKey(row.itemName);
    const list = historyByItem.get(key) ?? [];
    if (!list.some((q) => q.vendor === row.vendor)) {
      list.push({
        vendor: row.vendor,
        unitPrice: row.unitPrice,
        unit: row.unit,
        source: "history",
      });
    }
    historyByItem.set(key, list);
  }

  const catalogByItemId = new Map<string, VendorPriceQuote[]>();
  for (const cat of catalogItems) {
    if (!cat.inventoryItemId || !connectedProviders.has(cat.provider)) continue;
    const vendor = vendorEdiProviderLabel(cat.provider);
    const list = catalogByItemId.get(cat.inventoryItemId) ?? [];
    list.push({
      vendor,
      unitPrice: cat.unitPrice,
      unit: cat.unit,
      source: "edi",
      inStock: cat.inStock,
    });
    catalogByItemId.set(cat.inventoryItemId, list);
  }

  const bids: VendorBidLine[] = [];

  for (const item of inventory) {
    const key = normalizeItemKey(item.name);
    const quotes: VendorPriceQuote[] = [];

    const pushQuote = (q: VendorPriceQuote) => {
      const existing = quotes.find(
        (x) => x.vendor.toLowerCase() === q.vendor.toLowerCase() && x.unit === q.unit
      );
      if (!existing || q.unitPrice < existing.unitPrice) {
        if (existing) {
          const idx = quotes.indexOf(existing);
          quotes[idx] = q;
        } else {
          quotes.push(q);
        }
      }
    };

    for (const q of historyByItem.get(key) ?? []) pushQuote(q);
    for (const q of catalogByItemId.get(item.id) ?? []) {
      if (q.inStock !== false) pushQuote(q);
    }
    if (item.supplier) {
      pushQuote({
        vendor: item.supplier,
        unitPrice: item.costPerUnit,
        unit: item.unit,
        source: "inventory",
      });
    }

    if (quotes.length === 0) continue;

    quotes.sort((a, b) => a.unitPrice - b.unitPrice);
    const recommended = quotes[0]!;
    const currentPrice = item.costPerUnit;
    const savingsAmount = Math.max(0, currentPrice - recommended.unitPrice);
    const savingsPct = currentPrice > 0 ? (savingsAmount / currentPrice) * 100 : 0;

    const parGap = Math.max(0, Math.ceil(item.minQuantity * 1.5 - item.quantity));
    const suggestedQty = parGap > 0 ? parGap : item.quantity <= item.minQuantity ? Math.ceil(item.minQuantity) : 0;

    bids.push({
      inventoryItemId: item.id,
      itemName: item.name,
      unit: item.unit,
      currentVendor: item.supplier,
      currentPrice,
      suggestedQty,
      vendors: quotes,
      recommendedVendor: recommended.vendor,
      recommendedPrice: recommended.unitPrice,
      savingsAmount: Math.round(savingsAmount * 100) / 100,
      savingsPct: Math.round(savingsPct * 10) / 10,
    });
  }

  return bids
    .filter((b) => b.vendors.length >= 1)
    .sort((a, b) => b.savingsPct - a.savingsPct || b.suggestedQty - a.suggestedQty);
}

export function applyBiddingToSuggestion<T extends { inventoryItemId: string; vendor: string; unitPrice: number; lineTotal: number; suggestedQty: number }>(
  line: T,
  bid: VendorBidLine | undefined
): T {
  if (!bid || bid.vendors.length < 2) return line;
  if (bid.recommendedVendor === line.vendor && bid.recommendedPrice === line.unitPrice) return line;
  const qty = line.suggestedQty;
  const unitPrice = bid.recommendedPrice;
  return {
    ...line,
    vendor: bid.recommendedVendor,
    unitPrice,
    lineTotal: Math.round(qty * unitPrice * 100) / 100,
  };
}
