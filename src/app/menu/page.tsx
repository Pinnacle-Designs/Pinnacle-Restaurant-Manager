import { prisma } from "@/lib/prisma";
import { getLocationId } from "@/lib/location";
import { PageHeader } from "@/components/ui";
import { MenuClient } from "@/components/menu/MenuClient";
import { MenuChannelsPanel } from "@/components/menu/MenuChannelsPanel";
import { MenuEngineeringPanel } from "@/components/menu/MenuEngineeringPanel";
import { KitchenStationsPanel } from "@/components/kitchen/KitchenStationsPanel";
import { ModifierSetsClient } from "@/components/pos/ModifierSetsClient";
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
      select: { id: true, name: true, unit: true, costPerUnit: true },
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
      <MenuEngineeringPanel data={engineering} />
      <MenuChannelsPanel
        initialChannels={channels}
        initialRevision={location?.menuRevision ?? 0}
        sampleBasePrice={sampleBasePrice}
        locationId={locationId}
      />
      <KitchenStationsPanel />
      <MenuClient
        initialItems={items}
        stations={stations}
        engineeringByItemId={engineeringByItemId}
        inventory={inventory}
      />
      <ModifierSetsClient menuItems={items} />
    </div>
  );
}
