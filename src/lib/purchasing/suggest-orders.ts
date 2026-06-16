import { addDays, differenceInDays } from "date-fns";
import { prisma } from "@/lib/prisma";

export interface PoSuggestion {
  inventoryItemId: string;
  name: string;
  vendor: string;
  unit: string;
  onHand: number;
  minQuantity: number;
  suggestedQty: number;
  unitPrice: number;
  lineTotal: number;
  reason: string;
}

function holidayBoost(locationId: string, factors: { date: Date; impactPct: number; description: string }[]) {
  const now = new Date();
  const upcoming = factors.filter((f) => {
    const days = differenceInDays(f.date, now);
    return days >= 0 && days <= 14;
  });
  if (upcoming.length === 0) return { multiplier: 1, note: "" };
  const maxImpact = Math.max(...upcoming.map((f) => f.impactPct));
  const note = upcoming[0]!.description;
  return { multiplier: 1 + Math.min(maxImpact / 100, 0.35), note };
}

export async function generatePoSuggestions(locationId: string): Promise<PoSuggestion[]> {
  const [inventory, orders, factors] = await Promise.all([
    prisma.inventoryItem.findMany({ where: { locationId }, orderBy: { name: "asc" } }),
    prisma.order.findMany({
      where: {
        locationId,
        status: { in: ["PAID", "SERVED", "READY"] },
        createdAt: { gte: addDays(new Date(), -30) },
      },
      include: { items: { include: { menuItem: { include: { recipeLines: true } } } } },
    }),
    prisma.externalFactor.findMany({
      where: { locationId, date: { gte: new Date() } },
      orderBy: { date: "asc" },
      take: 5,
    }),
  ]);

  const depletion = new Map<string, number>();
  for (const order of orders) {
    for (const oi of order.items) {
      for (const rl of oi.menuItem.recipeLines) {
        const key = rl.inventoryItemId;
        depletion.set(key, (depletion.get(key) ?? 0) + rl.quantity * oi.quantity);
      }
    }
  }

  const daysInPeriod = 30;
  const dailyVelocity = new Map<string, number>();
  for (const [id, total] of depletion) {
    dailyVelocity.set(id, total / daysInPeriod);
  }

  const { multiplier, note } = holidayBoost(
    locationId,
    factors.map((f) => ({ date: f.date, impactPct: f.impactPct, description: f.description }))
  );

  const suggestions: PoSuggestion[] = [];

  for (const item of inventory) {
    const velocity = dailyVelocity.get(item.id) ?? 0;
    const daysCover = velocity > 0 ? item.quantity / velocity : 999;
    const targetDays = 7 * multiplier;
    const velocityTarget = Math.ceil(velocity * targetDays * 1.15);
    const parTarget = Math.ceil(Math.max(item.minQuantity * 1.5, item.minQuantity * multiplier));
    const targetStock = Math.max(parTarget, velocityTarget);
    const suggestedQty = Math.max(0, Math.ceil(targetStock - item.quantity));

    if (suggestedQty <= 0 && item.quantity > item.minQuantity) continue;
    if (suggestedQty <= 0 && item.quantity <= item.minQuantity) {
      // still below par
    }

    const qty = suggestedQty > 0 ? suggestedQty : Math.ceil(item.minQuantity * 2 - item.quantity);
    if (qty <= 0) continue;

    let reason = "Below par level";
    if (velocity > 0 && daysCover < 5) {
      reason = `~${daysCover.toFixed(1)} days of cover at current sales velocity`;
    }
    if (note && multiplier > 1) {
      reason += ` · Holiday boost: ${note}`;
    }

    suggestions.push({
      inventoryItemId: item.id,
      name: item.name,
      vendor: item.supplier ?? "General Supplier",
      unit: item.unit,
      onHand: item.quantity,
      minQuantity: item.minQuantity,
      suggestedQty: qty,
      unitPrice: item.costPerUnit,
      lineTotal: Math.round(qty * item.costPerUnit * 100) / 100,
      reason,
    });
  }

  return suggestions.sort((a, b) => b.suggestedQty - a.suggestedQty || a.name.localeCompare(b.name));
}

export async function createPurchaseOrder(
  locationId: string,
  lines: { inventoryItemId: string; qty: number; unitPrice?: number }[],
  opts?: { vendor?: string; source?: string; status?: string }
) {
  const inventory = await prisma.inventoryItem.findMany({
    where: { id: { in: lines.map((l) => l.inventoryItemId) }, locationId },
  });
  const invMap = new Map(inventory.map((i) => [i.id, i]));

  const poLines = lines
    .map((l) => {
      const item = invMap.get(l.inventoryItemId);
      if (!item) return null;
      const qty = l.qty;
      const unitPrice = l.unitPrice ?? item.costPerUnit;
      return {
        inventoryItemId: item.id,
        description: item.name,
        qtyOrdered: qty,
        unit: item.unit,
        unitPrice,
        lineTotal: Math.round(qty * unitPrice * 100) / 100,
      };
    })
    .filter(Boolean) as {
    inventoryItemId: string;
    description: string;
    qtyOrdered: number;
    unit: string;
    unitPrice: number;
    lineTotal: number;
  }[];

  if (poLines.length === 0) throw new Error("No valid lines");

  const vendor =
    opts?.vendor ??
    inventory.find((i) => i.supplier)?.supplier ??
    "General Supplier";
  const totalAmount = poLines.reduce((s, l) => s + l.lineTotal, 0);
  const poNumber = `PO-${Date.now().toString(36).toUpperCase()}`;

  const po = await prisma.vendorPurchaseOrder.create({
    data: {
      locationId,
      vendor,
      poNumber,
      status: opts?.status ?? "DRAFT",
      source: opts?.source ?? "SUGGESTED",
      lineCount: poLines.length,
      totalAmount,
      expectedAt: addDays(new Date(), 2),
      linesJson: JSON.stringify(poLines),
      lines: { create: poLines },
    },
    include: { lines: true },
  });

  await prisma.activityLog.create({
    data: {
      locationId,
      action: "CREATE",
      entity: "purchase_order",
      entityId: po.id,
      details: `PO ${poNumber} — ${poLines.length} lines, $${totalAmount.toFixed(2)} (${opts?.source ?? "SUGGESTED"})`,
    },
  });

  return po;
}
