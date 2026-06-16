import { startOfMonth } from "date-fns";
import { prisma } from "@/lib/prisma";

export interface LiveCogsSnapshot {
  monthLabel: string;
  mtdSales: number;
  mtdTheoreticalCogs: number;
  mtdWasteCost: number;
  mtdPurchases: number;
  mtdLiveCogs: number;
  liveCogsPct: number;
  theoreticalCogsPct: number;
  variancePct: number;
  dailyTrend: { date: string; sales: number; cogs: number; cogsPct: number }[];
  asOf: string;
}

export async function computeLiveCogs(locationId: string): Promise<LiveCogsSnapshot> {
  const monthStart = startOfMonth(new Date());
  const now = new Date();

  const [orders, waste, invoices, expenses] = await Promise.all([
    prisma.order.findMany({
      where: {
        locationId,
        status: "PAID",
        createdAt: { gte: monthStart },
      },
      include: { items: { include: { menuItem: true } } },
    }),
    prisma.inventoryWaste.findMany({
      where: { locationId, date: { gte: monthStart } },
    }),
    prisma.vendorInvoice.findMany({
      where: { locationId, invoiceDate: { gte: monthStart }, category: { contains: "Food" } },
    }),
    prisma.expense.findMany({
      where: {
        locationId,
        date: { gte: monthStart },
        category: { contains: "Food" },
      },
    }),
  ]);

  let mtdSales = 0;
  let mtdTheoreticalCogs = 0;
  const dailyMap = new Map<string, { sales: number; cogs: number }>();

  for (const order of orders) {
    const day = order.createdAt.toISOString().split("T")[0]!;
    let orderCogs = 0;
    let orderSales = 0;
    for (const item of order.items) {
      const rc = item.menuItem.recipeCost || item.menuItem.price * 0.28;
      orderCogs += rc * item.quantity;
      orderSales += item.price * item.quantity;
    }
    mtdSales += orderSales;
    mtdTheoreticalCogs += orderCogs;
    const d = dailyMap.get(day) ?? { sales: 0, cogs: 0 };
    d.sales += orderSales;
    d.cogs += orderCogs;
    dailyMap.set(day, d);
  }

  const mtdWasteCost = waste.reduce((s, w) => s + w.cost, 0);
  const mtdPurchases =
    invoices.reduce((s, i) => s + i.amount, 0) +
    expenses.reduce((s, e) => s + e.amount, 0);

  const mtdLiveCogs = mtdTheoreticalCogs + mtdWasteCost + mtdPurchases * 0.15;
  const liveCogsPct = mtdSales > 0 ? (mtdLiveCogs / mtdSales) * 100 : 0;
  const theoreticalCogsPct = mtdSales > 0 ? (mtdTheoreticalCogs / mtdSales) * 100 : 0;
  const variancePct = theoreticalCogsPct - liveCogsPct;

  const dailyTrend = [...dailyMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({
      date,
      sales: Math.round(v.sales * 100) / 100,
      cogs: Math.round(v.cogs * 100) / 100,
      cogsPct: v.sales > 0 ? Math.round((v.cogs / v.sales) * 1000) / 10 : 0,
    }));

  return {
    monthLabel: monthStart.toLocaleString("default", { month: "long", year: "numeric" }),
    mtdSales: Math.round(mtdSales * 100) / 100,
    mtdTheoreticalCogs: Math.round(mtdTheoreticalCogs * 100) / 100,
    mtdWasteCost: Math.round(mtdWasteCost * 100) / 100,
    mtdPurchases: Math.round(mtdPurchases * 100) / 100,
    mtdLiveCogs: Math.round(mtdLiveCogs * 100) / 100,
    liveCogsPct: Math.round(liveCogsPct * 10) / 10,
    theoreticalCogsPct: Math.round(theoreticalCogsPct * 10) / 10,
    variancePct: Math.round(variancePct * 10) / 10,
    dailyTrend,
    asOf: now.toISOString(),
  };
}
