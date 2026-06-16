import { prisma } from "@/lib/prisma";
import { getLocationId } from "@/lib/location";
import { PageHeader } from "@/components/ui";
import { InventoryClient } from "@/components/inventory/InventoryClient";
import { ensureInventoryStorageLayout } from "@/lib/walk-in/assign-inventory-zones";
import { Suspense } from "react";

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const locationId = await getLocationId();
  await ensureInventoryStorageLayout(locationId);

  const { tab } = await searchParams;
  const [items, zones] = await Promise.all([
    prisma.inventoryItem.findMany({
      where: { locationId },
      include: { storageZone: { select: { id: true, name: true, slug: true } } },
      orderBy: { name: "asc" },
    }),
    prisma.storageZone.findMany({
      where: { locationId },
      orderBy: { sortOrder: "asc" },
      include: { _count: { select: { items: true, routeSteps: true } } },
    }),
  ]);

  return (
    <div>
      <PageHeader
        title="Inventory"
        description="Track stock by storage zone, run shelf-to-sheet counts with scan & scale, and manage par levels"
      />
      <Suspense fallback={<p className="text-sm text-slate-500">Loading inventory…</p>}>
        <InventoryClient initialItems={items} initialZones={zones} initialTab={tab} />
      </Suspense>
    </div>
  );
}
