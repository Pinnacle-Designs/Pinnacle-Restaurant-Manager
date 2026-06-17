import { prisma } from "@/lib/prisma";
import { getLocationId } from "@/lib/location";
import { PageHeader } from "@/components/ui";
import { TablesClient } from "@/components/tables/TablesClient";
import {
  ensureFloorPlanDefaults,
  fillMissingPositions,
  parseFloorPlanSections,
} from "@/lib/tables/floor-plan";

export default async function TablesPage() {
  const locationId = await getLocationId();
  await ensureFloorPlanDefaults(locationId);

  const location = await prisma.location.findUniqueOrThrow({
    where: { id: locationId },
    select: {
      floorPlanWidth: true,
      floorPlanHeight: true,
      floorPlanSections: true,
    },
  });

  const rawTables = await prisma.table.findMany({
    where: { locationId },
    orderBy: { number: "asc" },
    include: {
      orders: {
        where: { status: { notIn: ["PAID", "CANCELLED"] } },
        take: 1,
        orderBy: { createdAt: "desc" },
      },
      reservations: {
        where: {
          status: { in: ["CONFIRMED", "SEATED"] },
          reservationAt: { gte: new Date(Date.now() - 2 * 60 * 60 * 1000) },
        },
        orderBy: { reservationAt: "asc" },
        take: 1,
      },
    },
  });

  const tables = fillMissingPositions(
    rawTables,
    location.floorPlanWidth,
    location.floorPlanHeight
  ).map((t) => ({
    ...t,
    reservations: t.reservations.map((r) => ({
      id: r.id,
      guestName: r.guestName,
      partySize: r.partySize,
      reservationAt: r.reservationAt.toISOString(),
      provider: r.provider,
    })),
  }));

  return (
    <div>
      <PageHeader
        title="Tables"
        description="Custom floor plan, live table status, and OpenTable / Resy reservation sync"
      />
      <TablesClient
        initialTables={tables}
        initialFloorPlan={{
          width: location.floorPlanWidth,
          height: location.floorPlanHeight,
          sections: parseFloorPlanSections(location.floorPlanSections),
        }}
      />
    </div>
  );
}
