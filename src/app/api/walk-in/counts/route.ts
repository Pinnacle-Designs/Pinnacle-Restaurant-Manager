import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getLocationIdFromRequest } from "@/lib/location";
import { requirePermission } from "@/lib/api-auth";
import { startCountSession, getRouteForZone } from "@/lib/walk-in/count-session";
import { getFifoAlerts } from "@/lib/walk-in/fifo";
import { parseAlternateUnits } from "@/lib/walk-in/unit-convert";
import { ensureInventoryStorageLayout } from "@/lib/walk-in/assign-inventory-zones";

export async function GET(request: NextRequest) {
  const { error } = await requirePermission(request, "manage_inventory");
  if (error) return error;

  const locationId = await getLocationIdFromRequest(request);
  await ensureInventoryStorageLayout(locationId);

  const [zones, sessions, alerts] = await Promise.all([
    prisma.storageZone.findMany({
      where: { locationId },
      include: {
        routeSteps: {
          include: { inventoryItem: true },
          orderBy: { sortOrder: "asc" },
        },
        _count: { select: { items: true } },
      },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.inventoryCountSession.findMany({
      where: { locationId },
      include: { zone: true, lines: true },
      orderBy: { startedAt: "desc" },
      take: 10,
    }),
    getFifoAlerts(locationId),
  ]);

  const activeSession = sessions.find((s) => s.status === "IN_PROGRESS") ?? null;

  return NextResponse.json({ zones, sessions, activeSession, fifoAlerts: alerts });
}

export async function POST(request: NextRequest) {
  const { error } = await requirePermission(request, "manage_inventory");
  if (error) return error;

  const locationId = await getLocationIdFromRequest(request);
  const body = await request.json();

  const session = await startCountSession(
    locationId,
    body.zoneId,
    body.startedBy
  );

  const route = body.zoneId ? await getRouteForZone(body.zoneId) : [];

  return NextResponse.json({ session, route });
}
