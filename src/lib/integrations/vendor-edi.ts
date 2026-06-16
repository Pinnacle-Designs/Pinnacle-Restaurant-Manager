import { prisma } from "@/lib/prisma";
import type { VendorEdiProvider } from "@prisma/client";
import { vendorEdiProviderLabel } from "./providers";

const SKU_PREFIX: Record<VendorEdiProvider, string> = {
  SYSCO: "SYS",
  US_FOODS: "USF",
  GORDON_FOOD_SERVICE: "GFS",
};

const EDI_PRICE_FACTOR: Record<VendorEdiProvider, number> = {
  SYSCO: 1.02,
  US_FOODS: 0.98,
  GORDON_FOOD_SERVICE: 1.0,
};

const EDI_ACCOUNT: Record<VendorEdiProvider, string> = {
  SYSCO: "SY-482910",
  US_FOODS: "USF-771204",
  GORDON_FOOD_SERVICE: "GFS-339018",
};

const EDI_WAREHOUSE: Record<VendorEdiProvider, string> = {
  SYSCO: "AUS-DC12",
  US_FOODS: "AUS-WH08",
  GORDON_FOOD_SERVICE: "AUS-GFS04",
};

export async function connectVendorEdi(
  locationId: string,
  provider: VendorEdiProvider,
  accountNumber?: string
) {
  const live = Boolean(process.env[`${provider}_EDI_API_KEY`]);
  return prisma.vendorEdiConnection.upsert({
    where: { locationId_provider: { locationId, provider } },
    create: {
      locationId,
      provider,
      connected: true,
      accountNumber: accountNumber || EDI_ACCOUNT[provider],
      warehouseCode: EDI_WAREHOUSE[provider],
      lastSyncStatus: live ? "live" : "demo",
    },
    update: {
      connected: true,
      accountNumber: accountNumber || undefined,
      lastSyncStatus: live ? "live" : "demo",
    },
  });
}

export async function disconnectVendorEdi(locationId: string, provider: VendorEdiProvider) {
  return prisma.vendorEdiConnection.update({
    where: { locationId_provider: { locationId, provider } },
    data: { connected: false, lastSyncStatus: "disconnected" },
  });
}

export async function syncVendorCatalog(locationId: string, provider: VendorEdiProvider) {
  const conn = await prisma.vendorEdiConnection.findUnique({
    where: { locationId_provider: { locationId, provider } },
  });
  if (!conn?.connected) {
    throw new Error(`${vendorEdiProviderLabel(provider)} EDI is not connected`);
  }

  const inventory = await prisma.inventoryItem.findMany({
    where: { locationId },
    orderBy: { name: "asc" },
  });

  const prefix = SKU_PREFIX[provider];
  let upserted = 0;

  for (const [idx, item] of inventory.entries()) {
    const sku = `${prefix}-${String(idx + 1).padStart(5, "0")}`;
    const lowStock = item.quantity <= item.minQuantity;
    const inStock = !lowStock && Math.random() > 0.08;

    await prisma.vendorCatalogItem.upsert({
      where: { locationId_provider_sku: { locationId, provider, sku } },
      create: {
        locationId,
        provider,
        sku,
        name: item.name,
        unit: item.unit,
        packSize: item.unit === "each" ? "1 each" : `1 ${item.unit}`,
        unitPrice: Math.round(item.costPerUnit * EDI_PRICE_FACTOR[provider] * 100) / 100,
        inStock,
        leadTimeDays: lowStock ? 2 : 1,
        inventoryItemId: item.id,
      },
      update: {
        name: item.name,
        unit: item.unit,
        unitPrice: Math.round(item.costPerUnit * EDI_PRICE_FACTOR[provider] * 100) / 100,
        inStock,
        leadTimeDays: lowStock ? 2 : 1,
        inventoryItemId: item.id,
      },
    });
    upserted += 1;
  }

  const catalogCount = await prisma.vendorCatalogItem.count({
    where: { locationId, provider },
  });
  const outOfStock = await prisma.vendorCatalogItem.count({
    where: { locationId, provider, inStock: false },
  });

  await prisma.vendorEdiConnection.update({
    where: { id: conn.id },
    data: {
      catalogItemsCount: catalogCount,
      lastCatalogSyncAt: new Date(),
      lastSyncStatus: "ok",
    },
  });

  return {
    catalogItems: catalogCount,
    outOfStock,
    message: `Synced ${upserted} catalog lines from ${vendorEdiProviderLabel(provider)}.`,
  };
}

export async function submitVendorPurchaseOrder(locationId: string, provider: VendorEdiProvider) {
  const conn = await prisma.vendorEdiConnection.findUnique({
    where: { locationId_provider: { locationId, provider } },
  });
  if (!conn?.connected) {
    throw new Error(`${vendorEdiProviderLabel(provider)} EDI is not connected`);
  }

  const lowItems = await prisma.inventoryItem.findMany({
    where: { locationId },
  });
  const reorderLines = lowItems
    .filter((i) => i.quantity <= i.minQuantity)
    .slice(0, 8);

  if (reorderLines.length === 0) {
    throw new Error("No items below par — nothing to order.");
  }

  const catalog = await prisma.vendorCatalogItem.findMany({
    where: {
      locationId,
      provider,
      inventoryItemId: { in: reorderLines.map((r) => r.id) },
      inStock: true,
    },
  });

  const lines = reorderLines.map((item) => {
    const cat = catalog.find((c) => c.inventoryItemId === item.id);
    const orderQty = Math.max(item.minQuantity * 2 - item.quantity, item.minQuantity);
    const unitPrice = cat?.unitPrice ?? item.costPerUnit;
    return {
      sku: cat?.sku ?? `MANUAL-${item.id.slice(-4)}`,
      name: item.name,
      quantity: orderQty,
      unit: item.unit,
      unitPrice,
      lineTotal: Math.round(orderQty * unitPrice * 100) / 100,
    };
  });

  const totalAmount = lines.reduce((s, l) => s + l.lineTotal, 0);

  const po = await prisma.vendorPurchaseOrder.create({
    data: {
      locationId,
      provider,
      status: "SUBMITTED",
      lineCount: lines.length,
      totalAmount,
      linesJson: JSON.stringify(lines),
    },
  });

  await prisma.vendorEdiConnection.update({
    where: { id: conn.id },
    data: { lastOrderAt: new Date(), lastSyncStatus: "order_submitted" },
  });

  await prisma.activityLog.create({
    data: {
      locationId,
      action: "VENDOR_EDI_ORDER",
      entity: "purchase_order",
      entityId: po.id,
      details: `${vendorEdiProviderLabel(provider)} PO — ${lines.length} lines, $${totalAmount.toFixed(2)}`,
    },
  });

  return {
    orderId: po.id,
    lineCount: lines.length,
    totalAmount,
    message: `Purchase order submitted to ${vendorEdiProviderLabel(provider)} warehouse.`,
  };
}
