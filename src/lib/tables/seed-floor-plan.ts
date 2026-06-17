import { prisma } from "@/lib/prisma";
import {
  DEFAULT_FLOOR_PLAN_SECTIONS,
  DEFAULT_TABLE_LAYOUT,
  serializeFloorPlanSections,
} from "@/lib/tables/floor-plan";
import { connectReservationProvider } from "@/lib/reservations/connection";
import { syncReservationsFromProvider } from "@/lib/reservations/sync";

export async function seedFloorPlanAndReservations(locationId: string) {
  await prisma.location.update({
    where: { id: locationId },
    data: {
      floorPlanWidth: 900,
      floorPlanHeight: 600,
      floorPlanSections: serializeFloorPlanSections(DEFAULT_FLOOR_PLAN_SECTIONS),
    },
  });

  const tables = await prisma.table.findMany({ where: { locationId } });
  for (const layout of DEFAULT_TABLE_LAYOUT) {
    const table = tables.find((t) => t.number === layout.number);
    if (!table) continue;
    await prisma.table.update({
      where: { id: table.id },
      data: {
        section: layout.section,
        shape: layout.shape,
        posX: layout.posX,
        posY: layout.posY,
        width: layout.width,
        height: layout.height,
        capacity: layout.capacity,
      },
    });
  }

  await connectReservationProvider(locationId, "OPENTABLE", {
    restaurantId: "smoky-oak-demo",
    restaurantName: "Smoky Oak BBQ — OpenTable",
  });

  try {
    await syncReservationsFromProvider(locationId, "OPENTABLE");
  } catch {
    // partial ok
  }
}
