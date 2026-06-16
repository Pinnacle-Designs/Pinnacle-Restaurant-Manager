import { addDays, startOfDay } from "date-fns";
import { prisma } from "@/lib/prisma";

export interface PrepTask {
  ingredient: string;
  unit: string;
  rawQtyNeeded: number;
  sellableQtyNeeded: number;
  onHand: number;
  prepQty: number;
  yieldPct: number;
  forMenuItems: string[];
  priority: "HIGH" | "NORMAL";
}

export interface PrepList {
  date: string;
  forecastCovers: number;
  tasks: PrepTask[];
  summary: string;
}

export async function generatePrepList(locationId: string, targetDate = new Date()): Promise<PrepList> {
  const periodStart = addDays(startOfDay(targetDate), -30);

  const [orders, menuItems, inventory] = await Promise.all([
    prisma.order.findMany({
      where: {
        locationId,
        status: { in: ["PAID", "SERVED", "READY"] },
        createdAt: { gte: periodStart },
      },
      include: { items: { include: { menuItem: { include: { recipeLines: { include: { inventoryItem: true } } } } } } },
    }),
    prisma.menuItem.findMany({
      where: { locationId, available: true },
      include: { recipeLines: { include: { inventoryItem: true } } },
    }),
    prisma.inventoryItem.findMany({ where: { locationId } }),
  ]);

  const invMap = new Map(inventory.map((i) => [i.id, i]));

  const salesByMenu = new Map<string, number>();
  for (const order of orders) {
    for (const oi of order.items) {
      salesByMenu.set(oi.menuItemId, (salesByMenu.get(oi.menuItemId) ?? 0) + oi.quantity);
    }
  }

  const daysInPeriod = 30;
  const dayOfWeek = targetDate.getDay();
  const dowMultiplier = dayOfWeek === 5 || dayOfWeek === 6 ? 1.25 : dayOfWeek === 0 ? 1.15 : 1;

  const ingredientNeed = new Map<
    string,
    { raw: number; sellable: number; unit: string; yieldPct: number; menus: Set<string> }
  >();

  for (const menu of menuItems) {
    const totalSold = salesByMenu.get(menu.id) ?? 0;
    const dailyForecast = Math.max(1, Math.ceil((totalSold / daysInPeriod) * dowMultiplier));
    if (!menu.recipeLines.length) continue;

    for (const line of menu.recipeLines) {
      const yieldPct = line.inventoryItem.yieldPct ?? 100;
      const sellablePerPlate = line.quantity * dailyForecast;
      const rawPerPlate = sellablePerPlate / (yieldPct / 100);
      const key = line.inventoryItemId;
      const existing = ingredientNeed.get(key) ?? {
        raw: 0,
        sellable: 0,
        unit: line.inventoryItem.unit,
        yieldPct,
        menus: new Set<string>(),
      };
      existing.raw += rawPerPlate;
      existing.sellable += sellablePerPlate;
      existing.menus.add(menu.name);
      ingredientNeed.set(key, existing);
    }
  }

  const tasks: PrepTask[] = [];

  for (const [inventoryItemId, need] of ingredientNeed) {
    const inv = invMap.get(inventoryItemId);
    if (!inv) continue;

    const prepQty = Math.max(0, Math.ceil((need.raw - inv.quantity) * 10) / 10);
    if (prepQty <= 0 && need.raw <= inv.quantity * 0.5) continue;

    tasks.push({
      ingredient: inv.name,
      unit: need.unit,
      rawQtyNeeded: Math.round(need.raw * 10) / 10,
      sellableQtyNeeded: Math.round(need.sellable * 10) / 10,
      onHand: inv.quantity,
      prepQty: prepQty > 0 ? prepQty : need.raw,
      yieldPct: need.yieldPct,
      forMenuItems: [...need.menus],
      priority: prepQty > 0 || inv.quantity < inv.minQuantity ? "HIGH" : "NORMAL",
    });
  }

  tasks.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority === "HIGH" ? -1 : 1;
    return b.prepQty - a.prepQty;
  });

  const forecastCovers = Math.round(
    [...salesByMenu.values()].reduce((s, v) => s + v, 0) / daysInPeriod
  );

  return {
    date: targetDate.toISOString().split("T")[0]!,
    forecastCovers,
    tasks,
    summary: `${tasks.length} prep tasks for ~${forecastCovers} covers (forecast from 30-day velocity)`,
  };
}

export function formatYieldNote(rawQty: number, yieldPct: number, unit: string): string {
  const sellable = rawQty * (yieldPct / 100);
  return `${rawQty} ${unit} raw → ${sellable.toFixed(1)} ${unit} sellable (${yieldPct}% yield)`;
}
