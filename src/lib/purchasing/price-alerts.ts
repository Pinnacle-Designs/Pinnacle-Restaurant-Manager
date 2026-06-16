import { prisma } from "@/lib/prisma";

const DEFAULT_SPIKE_THRESHOLD_PCT = 5;

export async function checkPriceSpikes(
  locationId: string,
  vendor: string,
  lines: { description: string; unitPrice: number; inventoryItemId?: string | null }[],
  thresholdPct = DEFAULT_SPIKE_THRESHOLD_PCT
) {
  const alerts: { item: string; oldPrice: number; newPrice: number; changePct: number }[] = [];

  for (const line of lines) {
    let baseline = 0;

    if (line.inventoryItemId) {
      const item = await prisma.inventoryItem.findFirst({
        where: { id: line.inventoryItemId, locationId },
      });
      if (item) baseline = item.previousCostPerUnit ?? item.costPerUnit;
    }

    if (baseline <= 0) {
      const history = await prisma.vendorPriceHistory.findFirst({
        where: { locationId, vendor, itemName: line.description },
        orderBy: { effectiveDate: "desc" },
      });
      baseline = history?.unitPrice ?? 0;
    }

    if (baseline <= 0) continue;

    const changePct = ((line.unitPrice - baseline) / baseline) * 100;
    if (changePct >= thresholdPct) {
      alerts.push({
        item: line.description,
        oldPrice: baseline,
        newPrice: line.unitPrice,
        changePct: Math.round(changePct * 10) / 10,
      });
    }
  }

  for (const alert of alerts) {
    const existing = await prisma.businessInsight.findFirst({
      where: {
        locationId,
        resolved: false,
        title: { contains: alert.item },
        category: "INVENTORY",
      },
    });
    if (existing) continue;

    await prisma.businessInsight.create({
      data: {
        locationId,
        title: `Price spike: ${alert.item}`,
        description: `${vendor} raised ${alert.item} from $${alert.oldPrice.toFixed(2)} to $${alert.newPrice.toFixed(2)} (+${alert.changePct}%). Review before paying this invoice.`,
        category: "INVENTORY",
        severity: alert.changePct >= 15 ? "CRITICAL" : alert.changePct >= 10 ? "HIGH" : "MEDIUM",
        actionable: "Negotiate with vendor or find alternate supplier",
        dataSnapshot: JSON.stringify(alert),
      },
    });
  }

  return alerts;
}

export async function updateInventoryCostsFromInvoice(
  locationId: string,
  lines: { inventoryItemId?: string | null; description: string; unitPrice: number }[]
) {
  for (const line of lines) {
    if (!line.inventoryItemId) continue;
    const item = await prisma.inventoryItem.findFirst({
      where: { id: line.inventoryItemId, locationId },
    });
    if (!item) continue;

    await prisma.inventoryItem.update({
      where: { id: item.id },
      data: {
        previousCostPerUnit: item.costPerUnit,
        costPerUnit: line.unitPrice,
      },
    });

    await prisma.vendorPriceHistory.create({
      data: {
        locationId,
        vendor: item.supplier ?? "Unknown",
        itemName: line.description,
        category: "Food & Supplies",
        unitPrice: line.unitPrice,
        unit: item.unit,
      },
    });
  }
}
