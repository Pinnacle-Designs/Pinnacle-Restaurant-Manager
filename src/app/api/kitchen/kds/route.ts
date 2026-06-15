import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getLocationIdFromRequest } from "@/lib/location";
import { requirePermission } from "@/lib/api-auth";
import { ensureKitchenStations } from "@/lib/kitchen/stations";

export async function GET(request: NextRequest) {
  const { error } = await requirePermission(request, "manage_boh");
  if (error) return error;

  const locationId = await getLocationIdFromRequest(request);
  const stationId = request.nextUrl.searchParams.get("stationId");
  const status = request.nextUrl.searchParams.get("status") ?? "active";

  await ensureKitchenStations(locationId);

  const items = await prisma.orderItem.findMany({
    where: {
      routesToKitchen: true,
      order: {
        locationId,
        status: { notIn: ["PAID", "CANCELLED"] },
        checkStatus: { not: "CLOSED" },
      },
      ...(stationId ? { kitchenStationId: stationId } : {}),
      ...(status === "active"
        ? { kitchenStatus: { in: ["FIRED", "PENDING"] } }
        : {}),
    },
    include: {
      menuItem: { select: { id: true, name: true, category: true } },
      kitchenStation: { select: { id: true, name: true, slug: true, outputKind: true, color: true } },
      order: {
        select: {
          id: true,
          status: true,
          table: { select: { number: true } },
          guestCount: true,
        },
      },
    },
    orderBy: [{ firedAt: "asc" }, { id: "asc" }],
    take: 80,
  });

  const stations = await prisma.kitchenStation.findMany({
    where: { locationId, active: true },
    orderBy: { sortOrder: "asc" },
  });

  const tickets = items
    .filter((line) => line.kitchenStatus === "FIRED" || line.kitchenStatus === "PENDING")
    .map((line) => ({
      id: line.id,
      orderId: line.orderId,
      tableNumber: line.order.table?.number ?? null,
      course: line.course,
      quantity: line.quantity,
      menuItemName: line.menuItem.name,
      modifierSummary: line.modifierSummary,
      seatNumber: line.seatNumber,
      kitchenStatus: line.kitchenStatus,
      firedAt: line.firedAt?.toISOString() ?? null,
      station: line.kitchenStation,
    }));

  return NextResponse.json({ stations, tickets });
}
