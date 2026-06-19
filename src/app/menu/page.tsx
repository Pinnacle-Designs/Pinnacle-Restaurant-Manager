import { prisma } from "@/lib/prisma";
import { getLocationId } from "@/lib/location";
import { PageHeader } from "@/components/ui";
import { MenuPageClient } from "@/components/menu/MenuPageClient";
import { getMenuChannelConfigs } from "@/lib/menu/publish";
import { ensureKitchenStations } from "@/lib/kitchen/stations";
import { computeMenuEngineering } from "@/lib/menu/engineering";

export default async function MenuPage() {
  const locationId = await getLocationId();
  const [items, location, channels, stations, engineering, inventory] = await Promise.all([
    prisma.menuItem.findMany({
      where: { locationId },
      orderBy: [{ category: "asc" }, { name: "asc" }],
    }),
    prisma.location.findUnique({
      where: { id: locationId },
      select: { menuRevision: true },
    }),
    getMenuChannelConfigs(locationId),
    ensureKitchenStations(locationId),
    computeMenuEngineering(locationId),
    prisma.inventoryItem.findMany({
      where: { locationId },
      orderBy: { name: "asc" },
      select: { id: true, name: true, unit: true, costPerUnit: true, yieldPct: true },
    }),
  ]);

  const sampleBasePrice = items.find((i) => i.available)?.price ?? items[0]?.price ?? 12.99;
  const engineeringByItemId = Object.fromEntries(engineering.items.map((i) => [i.id, i]));

  return (
    <div>
      <PageHeader
        title="Menu"
        description="Revenue asset — engineering, sales categories, recipe costing, and omnichannel sync"
      />
      <MenuPageClient
        engineering={engineering}
        engineeringByItemId={engineeringByItemId}
        channels={channels}
        menuRevision={location?.menuRevision ?? 0}
        sampleBasePrice={sampleBasePrice}
        locationId={locationId}
        items={items}
        stations={stations}
        inventory={inventory}
      />
    </div>
  );
}
