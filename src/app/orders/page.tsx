import { Suspense } from "react";
import { prisma } from "@/lib/prisma";
import { getLocationId } from "@/lib/location";
import { ORDER_INCLUDE } from "@/lib/orders";
import { PageHeader } from "@/components/ui";
import { OrdersHubClient } from "@/components/orders/OrdersHubClient";
import { getPosMenuBundleSafe } from "@/lib/menu/resolve-pos-menu";

export default async function OrdersPage() {
  const locationId = await getLocationId();
  const [orders, menuBundle, tables] = await Promise.all([
    prisma.order.findMany({
      where: { locationId },
      include: ORDER_INCLUDE,
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    getPosMenuBundleSafe(locationId),
    prisma.table.findMany({ where: { locationId }, orderBy: { number: "asc" } }),
  ]);

  const menuItems = menuBundle.menuItems.map((item) => ({
    id: item.id,
    name: item.name,
    price: item.price,
    category: item.category,
    available: item.available ?? true,
    posColor: item.posColor,
    posGridIndex: item.posGridIndex,
    stockCount: item.stockCount,
    eightySixed: item.eightySixed,
  }));

  return (
    <div>
      <PageHeader
        title="Orders"
        description="One screen for rush service and check management — tap Serve for the floor, Checks for payments and history"
      />
      <Suspense fallback={<p className="text-slate-500">Loading…</p>}>
        <OrdersHubClient
          initialOrders={orders}
          menuItems={menuItems}
          tables={tables}
          initialMenuRevision={menuBundle.menuRevision}
          defaultView="serve"
        />
      </Suspense>
    </div>
  );
}
