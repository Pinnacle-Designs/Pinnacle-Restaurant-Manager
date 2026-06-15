import { prisma } from "@/lib/prisma";
import type { MenuQuadrant } from "@/lib/analytics/types";

const PERIOD_DAYS = 30;

function menuQuadrant(
  popularityPct: number,
  marginPct: number,
  avgPopularityPct: number,
  avgMarginPct: number
): MenuQuadrant {
  const popular = popularityPct >= avgPopularityPct;
  const profitable = marginPct >= avgMarginPct;
  if (popular && profitable) return "star";
  if (popular && !profitable) return "plowhorse";
  if (!popular && profitable) return "puzzle";
  return "dog";
}

export type MenuEngineeringRow = {
  id: string;
  name: string;
  category: string;
  salesCategory: string;
  price: number;
  recipeCost: number;
  margin: number;
  marginPct: number;
  foodCostPct: number;
  quantitySold: number;
  popularityPct: number;
  contribution: number;
  quadrant: MenuQuadrant;
};

export type MenuEngineeringSnapshot = {
  periodDays: number;
  items: MenuEngineeringRow[];
  stars: number;
  plowhorses: number;
  puzzles: number;
  dogs: number;
  totalItemsSold: number;
  totalContribution: number;
  avgPopularityPct: number;
  avgMarginPct: number;
  byQuadrant: Record<MenuQuadrant, MenuEngineeringRow[]>;
};

export async function computeMenuEngineering(
  locationId: string,
  periodDays = PERIOD_DAYS
): Promise<MenuEngineeringSnapshot> {
  const since = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000);

  const [menuItems, orders] = await Promise.all([
    prisma.menuItem.findMany({ where: { locationId } }),
    prisma.order.findMany({
      where: {
        locationId,
        status: "PAID",
        createdAt: { gte: since },
      },
      include: {
        items: {
          where: { routesToKitchen: true },
          include: { menuItem: true },
        },
      },
    }),
  ]);

  const itemSales: Record<string, number> = {};
  for (const order of orders) {
    for (const line of order.items) {
      if (line.price <= 0 && line.parentOrderItemId) continue;
      itemSales[line.menuItemId] = (itemSales[line.menuItemId] ?? 0) + line.quantity;
    }
  }

  const totalItemsSold = Object.values(itemSales).reduce((s, q) => s + q, 0);

  const base = menuItems.map((m) => {
    const sold = itemSales[m.id] ?? 0;
    const recipeCost = m.recipeCost || m.price * 0.28;
    const margin = m.price - recipeCost;
    const marginPct = m.price > 0 ? (margin / m.price) * 100 : 0;
    const foodCostPct = m.price > 0 ? (recipeCost / m.price) * 100 : 0;
    const popularityPct = totalItemsSold > 0 ? (sold / totalItemsSold) * 100 : 0;
    return {
      id: m.id,
      name: m.name,
      category: m.category,
      salesCategory: m.salesCategory,
      price: m.price,
      recipeCost,
      margin,
      marginPct,
      foodCostPct,
      quantitySold: sold,
      popularityPct,
      contribution: margin * sold,
    };
  });

  const soldItems = base.filter((i) => i.quantitySold > 0);
  const avgPopularityPct =
    soldItems.length > 0
      ? soldItems.reduce((s, i) => s + i.popularityPct, 0) / soldItems.length
      : 0;
  const avgMarginPct =
    base.length > 0 ? base.reduce((s, i) => s + i.marginPct, 0) / base.length : 0;

  const items: MenuEngineeringRow[] = base.map((i) => ({
    ...i,
    quadrant: menuQuadrant(i.popularityPct, i.marginPct, avgPopularityPct, avgMarginPct),
  }));

  const byQuadrant: Record<MenuQuadrant, MenuEngineeringRow[]> = {
    star: [],
    plowhorse: [],
    puzzle: [],
    dog: [],
  };
  for (const row of items) {
    byQuadrant[row.quadrant].push(row);
  }

  return {
    periodDays,
    items,
    stars: byQuadrant.star.length,
    plowhorses: byQuadrant.plowhorse.length,
    puzzles: byQuadrant.puzzle.length,
    dogs: byQuadrant.dog.length,
    totalItemsSold,
    totalContribution: items.reduce((s, i) => s + i.contribution, 0),
    avgPopularityPct,
    avgMarginPct,
    byQuadrant,
  };
}
