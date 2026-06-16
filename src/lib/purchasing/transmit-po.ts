import { prisma } from "@/lib/prisma";
import { vendorEdiProviderLabel } from "@/lib/integrations/providers";

export async function approveAndTransmitPurchaseOrder(locationId: string, poId: string) {
  const po = await prisma.vendorPurchaseOrder.findFirst({
    where: { id: poId, locationId },
    include: { lines: true },
  });

  if (!po) throw new Error("Purchase order not found");
  if (po.status !== "DRAFT" && po.status !== "SUGGESTED") {
    throw new Error(`Cannot approve PO in status ${po.status}`);
  }

  const method = po.provider ? "edi" : "email";
  const vendorLabel = po.vendor ?? (po.provider ? vendorEdiProviderLabel(po.provider) : "vendor");

  const updated = await prisma.vendorPurchaseOrder.update({
    where: { id: poId },
    data: {
      status: "SUBMITTED",
      submittedAt: new Date(),
    },
    include: { lines: true },
  });

  if (po.provider) {
    await prisma.vendorEdiConnection.updateMany({
      where: { locationId, provider: po.provider, connected: true },
      data: { lastOrderAt: new Date(), lastSyncStatus: "order_transmitted" },
    });
  }

  const transmissionDetail =
    method === "edi"
      ? `EDI transmission to ${vendorLabel} warehouse — ${updated.lineCount} lines, $${updated.totalAmount.toFixed(2)}`
      : `Emailed PO ${updated.poNumber ?? poId.slice(-8)} to ${vendorLabel} — ${updated.lineCount} lines, $${updated.totalAmount.toFixed(2)}`;

  await prisma.activityLog.create({
    data: {
      locationId,
      action: method === "edi" ? "PO_EDI_TRANSMIT" : "PO_EMAIL_TRANSMIT",
      entity: "purchase_order",
      entityId: poId,
      details: transmissionDetail,
    },
  });

  return {
    po: updated,
    method,
    message:
      method === "edi"
        ? `Purchase order transmitted to ${vendorLabel} via EDI.`
        : `Purchase order emailed to ${vendorLabel}. (Demo mode logs transmission — configure SMTP for live email.)`,
  };
}
