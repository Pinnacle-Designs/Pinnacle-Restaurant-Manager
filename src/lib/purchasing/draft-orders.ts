import { prisma } from "@/lib/prisma";
import { generatePoSuggestions, createPurchaseOrder } from "./suggest-orders";
import { applyBiddingToSuggestion, getCrossVendorBids } from "./vendor-bidding";

export interface DraftPoSummary {
  id: string;
  vendor: string | null;
  poNumber: string | null;
  status: string;
  lineCount: number;
  totalAmount: number;
  source: string;
  submittedAt: string;
  biddingSavings: number;
}

export async function listDraftPurchaseOrders(locationId: string): Promise<DraftPoSummary[]> {
  const orders = await prisma.vendorPurchaseOrder.findMany({
    where: { locationId, status: "DRAFT" },
    orderBy: { submittedAt: "desc" },
    include: { lines: true },
  });

  return orders.map((po) => ({
    id: po.id,
    vendor: po.vendor,
    poNumber: po.poNumber,
    status: po.status,
    lineCount: po.lineCount,
    totalAmount: po.totalAmount,
    source: po.source,
    submittedAt: po.submittedAt.toISOString(),
    biddingSavings: 0,
  }));
}

export async function buildDraftPurchaseOrdersByVendor(locationId: string) {
  const [suggestions, bids] = await Promise.all([
    generatePoSuggestions(locationId),
    getCrossVendorBids(locationId),
  ]);

  const bidMap = new Map(bids.map((b) => [b.inventoryItemId, b]));

  const byVendor = new Map<
    string,
    Array<{
      inventoryItemId: string;
      qty: number;
      unitPrice: number;
      biddingApplied: boolean;
    }>
  >();

  for (const raw of suggestions) {
    const bid = bidMap.get(raw.inventoryItemId);
    const line = applyBiddingToSuggestion(raw, bid);
    const vendor = line.vendor;
    const bucket = byVendor.get(vendor) ?? [];
    bucket.push({
      inventoryItemId: line.inventoryItemId,
      qty: line.suggestedQty,
      unitPrice: line.unitPrice,
      biddingApplied: Boolean(bid && bid.recommendedVendor !== raw.vendor),
    });
    byVendor.set(vendor, bucket);
  }

  const existingDrafts = await prisma.vendorPurchaseOrder.findMany({
    where: { locationId, status: "DRAFT", source: "AUTO_DRAFT" },
    select: { vendor: true },
  });
  const existingVendors = new Set(existingDrafts.map((d) => d.vendor));

  const created: DraftPoSummary[] = [];

  for (const [vendor, lines] of byVendor) {
    if (lines.length === 0) continue;
    if (existingVendors.has(vendor)) continue;

    const po = await createPurchaseOrder(
      locationId,
      lines.map((l) => ({
        inventoryItemId: l.inventoryItemId,
        qty: l.qty,
        unitPrice: l.unitPrice,
      })),
      { vendor, source: "AUTO_DRAFT", status: "DRAFT" }
    );

    created.push({
      id: po.id,
      vendor: po.vendor,
      poNumber: po.poNumber,
      status: po.status,
      lineCount: po.lineCount,
      totalAmount: po.totalAmount,
      source: po.source,
      submittedAt: po.submittedAt.toISOString(),
      biddingSavings: lines.filter((l) => l.biddingApplied).length,
    });
  }

  const allDrafts = await listDraftPurchaseOrders(locationId);
  return { created, drafts: allDrafts, vendorCount: byVendor.size };
}
