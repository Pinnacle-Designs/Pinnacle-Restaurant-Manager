import { prisma } from "@/lib/prisma";

function normalizeVendor(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(ltd|limited|inc|corp|co|llc|led)\b\.?/gi, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function vendorNamesMatch(a: string, b: string | null | undefined): boolean {
  if (!b?.trim()) return false;
  const na = normalizeVendor(a);
  const nb = normalizeVendor(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;

  const wordsA = na.split(" ").filter((w) => w.length > 3);
  const wordsB = new Set(nb.split(" ").filter((w) => w.length > 3));
  const overlap = wordsA.filter((w) => wordsB.has(w)).length;
  return overlap >= 2;
}

export async function suggestPoLinkForInvoice(locationId: string, vendor: string) {
  const orders = await prisma.vendorPurchaseOrder.findMany({
    where: {
      locationId,
      status: { in: ["SUBMITTED", "RECEIVED", "PARTIAL", "APPROVED"] },
    },
    include: {
      receipts: { orderBy: { createdAt: "desc" }, take: 1 },
      invoices: { select: { id: true } },
    },
    orderBy: { submittedAt: "desc" },
    take: 50,
  });

  const ranked = orders
    .filter((po) => vendorNamesMatch(vendor, po.vendor))
    .map((po) => ({
      po,
      score:
        (po.receipts[0] ? 10 : 0) +
        (po.invoices.length === 0 ? 5 : 0) +
        (po.status === "RECEIVED" ? 3 : 0),
    }))
    .sort((a, b) => b.score - a.score);

  const best = ranked[0]?.po;
  if (!best) return null;

  return {
    poId: best.id,
    receiptId: best.receipts[0]?.id ?? null,
    poNumber: best.poNumber,
  };
}

export async function linkInvoiceToPo(
  invoiceId: string,
  locationId: string,
  poId: string,
  receiptId?: string | null
) {
  const po = await prisma.vendorPurchaseOrder.findFirst({
    where: { id: poId, locationId },
    include: { receipts: { orderBy: { createdAt: "desc" }, take: 1 } },
  });
  if (!po) throw new Error("Purchase order not found");

  const resolvedReceiptId = receiptId ?? po.receipts[0]?.id ?? null;

  return prisma.vendorInvoice.update({
    where: { id: invoiceId },
    data: { poId: po.id, receiptId: resolvedReceiptId },
    include: { lines: true, po: { include: { lines: true } }, receipt: { include: { lines: true } } },
  });
}
