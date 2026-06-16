import { startOfMonth, subDays } from "date-fns";
import { prisma } from "@/lib/prisma";
import { rawQuantityForSellable } from "@/lib/menu/recipe";

export interface AvtLine {
  inventoryItemId: string;
  name: string;
  unit: string;
  theoreticalQty: number;
  actualQty: number;
  varianceQty: number;
  variancePct: number;
  varianceCost: number;
  flag: "OK" | "OVER" | "UNDER";
  likelyCause?: string;
}

export interface AvtReport {
  periodDays: number;
  lines: AvtLine[];
  totalTheoreticalCost: number;
  totalActualCost: number;
  totalVarianceCost: number;
  summary: string;
}

export async function computeAvtVariance(
  locationId: string,
  periodDays = 30
): Promise<AvtReport> {
  const since = subDays(new Date(), periodDays);

  const [inventory, orders, waste, countLines, receipts] = await Promise.all([
    prisma.inventoryItem.findMany({ where: { locationId } }),
    prisma.order.findMany({
      where: {
        locationId,
        status: { in: ["PAID", "SERVED", "READY"] },
        createdAt: { gte: since },
      },
      include: {
        items: {
          include: {
            menuItem: { include: { recipeLines: { include: { inventoryItem: true } } } },
          },
        },
      },
    }),
    prisma.inventoryWaste.findMany({
      where: { locationId, date: { gte: since } },
    }),
    prisma.inventoryCountLine.findMany({
      where: {
        session: { locationId, finalizedAt: { gte: since } },
      },
      include: { inventoryItem: true },
    }),
    prisma.goodsReceiptLine.findMany({
      where: { receipt: { locationId, receivedAt: { gte: since } } },
      include: { inventoryItem: true },
    }),
  ]);

  const theoretical = new Map<string, number>();
  for (const order of orders) {
    for (const oi of order.items) {
      for (const rl of oi.menuItem.recipeLines) {
        const raw = rawQuantityForSellable(rl.quantity * oi.quantity, rl.inventoryItem.yieldPct ?? 100);
        theoretical.set(rl.inventoryItemId, (theoretical.get(rl.inventoryItemId) ?? 0) + raw);
      }
    }
  }

  const wasteByItem = new Map<string, number>();
  for (const w of waste) {
    if (w.inventoryItemId) {
      wasteByItem.set(w.inventoryItemId, (wasteByItem.get(w.inventoryItemId) ?? 0) + w.quantity);
    }
  }

  const receivedByItem = new Map<string, number>();
  for (const r of receipts) {
    if (r.inventoryItemId) {
      receivedByItem.set(r.inventoryItemId, (receivedByItem.get(r.inventoryItemId) ?? 0) + r.qtyReceived);
    }
  }

  const countVariance = new Map<string, number>();
  for (const cl of countLines) {
    countVariance.set(cl.inventoryItemId, (countVariance.get(cl.inventoryItemId) ?? 0) + cl.variance);
  }

  const lines: AvtLine[] = [];
  let totalTheoreticalCost = 0;
  let totalActualCost = 0;

  for (const item of inventory) {
    const theo = theoretical.get(item.id) ?? 0;
    if (theo <= 0 && !wasteByItem.has(item.id) && !countVariance.has(item.id)) continue;

    const wasteQty = wasteByItem.get(item.id) ?? 0;
    const received = receivedByItem.get(item.id) ?? 0;
    const countVar = countVariance.get(item.id) ?? 0;

    // Actual usage ≈ theoretical + waste + shrink from counts (negative variance = more used than book)
    const actual = theo + wasteQty - countVar;
    const varianceQty = actual - theo;
    const variancePct = theo > 0 ? (varianceQty / theo) * 100 : 0;
    const varianceCost = varianceQty * item.costPerUnit;

    let flag: AvtLine["flag"] = "OK";
    let likelyCause: string | undefined;
    if (variancePct > 8) {
      flag = "OVER";
      likelyCause =
        wasteQty > theo * 0.1
          ? "High waste logged — check prep standards"
          : "Possible over-portioning or unrecorded waste";
    } else if (variancePct < -8) {
      flag = "UNDER";
      likelyCause = "Possible theft, unrecorded sales, or count error";
    }

    totalTheoreticalCost += theo * item.costPerUnit;
    totalActualCost += actual * item.costPerUnit;

    lines.push({
      inventoryItemId: item.id,
      name: item.name,
      unit: item.unit,
      theoreticalQty: Math.round(theo * 100) / 100,
      actualQty: Math.round(actual * 100) / 100,
      varianceQty: Math.round(varianceQty * 100) / 100,
      variancePct: Math.round(variancePct * 10) / 10,
      varianceCost: Math.round(varianceCost * 100) / 100,
      flag,
      likelyCause,
    });
  }

  lines.sort((a, b) => Math.abs(b.varianceCost) - Math.abs(a.varianceCost));

  const totalVarianceCost = totalActualCost - totalTheoreticalCost;
  const overCount = lines.filter((l) => l.flag === "OVER").length;

  return {
    periodDays,
    lines,
    totalTheoreticalCost: Math.round(totalTheoreticalCost * 100) / 100,
    totalActualCost: Math.round(totalActualCost * 100) / 100,
    totalVarianceCost: Math.round(totalVarianceCost * 100) / 100,
    summary:
      overCount > 0
        ? `${overCount} ingredient(s) over theoretical — review portioning and waste logs`
        : "Usage aligns with sales — variance within normal range",
  };
}
