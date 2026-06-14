import { Suspense } from "react";
import { prisma } from "@/lib/prisma";
import { getLocationId } from "@/lib/location";
import { getEnrichedSessionUser } from "@/lib/location-plan";
import { hasPermissionInList } from "@/lib/permissions";
import { DashboardClient } from "@/components/dashboard/DashboardClient";

async function getDashboardData() {
  const locationId = await getLocationId();
  const user = await getEnrichedSessionUser();
  const location = await prisma.location.findUnique({ where: { id: locationId } });

  const [
    menuCount,
    inventory,
    staffCount,
    recentOrders,
    expenses,
    insights,
    photoCount,
    activity,
  ] = await Promise.all([
    prisma.menuItem.count({ where: { locationId } }),
    prisma.inventoryItem.findMany({ where: { locationId } }),
    prisma.staffMember.count({ where: { locationId, active: true } }),
    prisma.order.findMany({
      where: {
        locationId,
        createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
      },
    }),
    user && hasPermissionInList(user.permissions, "view_finances")
      ? prisma.expense.findMany({
          where: {
            locationId,
            date: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
          },
        })
      : Promise.resolve([]),
    user && hasPermissionInList(user.permissions, "view_insights")
      ? prisma.businessInsight.findMany({
          where: { locationId, resolved: false },
          orderBy: { severity: "desc" },
          take: 5,
        })
      : Promise.resolve([]),
    prisma.photo.count({ where: { locationId } }),
    prisma.activityLog.findMany({
      where: { locationId },
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
  ]);

  const lowStock = inventory.filter((i) => i.quantity <= i.minQuantity);
  const weeklyRevenue = recentOrders
    .filter((o) => o.status === "PAID")
    .reduce((sum, o) => sum + o.totalAmount, 0);
  const monthlyExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);

  return {
    locationName: location?.name || "Main Location",
    menuCount,
    inventoryCount: inventory.length,
    lowStockCount: lowStock.length,
    staffCount,
    weeklyOrders: recentOrders.length,
    weeklyRevenue,
    monthlyExpenses,
    photoCount,
    insights: insights.map((i) => ({
      ...i,
      createdAt: i.createdAt.toISOString(),
    })),
    activity,
    lowStock,
  };
}

export default async function DashboardPage() {
  const data = await getDashboardData();
  return (
    <Suspense fallback={null}>
      <DashboardClient data={data} />
    </Suspense>
  );
}
