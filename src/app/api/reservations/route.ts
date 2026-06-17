import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getLocationIdFromRequest } from "@/lib/location";
import { requirePermission } from "@/lib/api-auth";
import { RESERVATION_PROVIDERS } from "@/lib/reservations/providers";
import type { ReservationProvider } from "@prisma/client";

export async function GET(request: NextRequest) {
  const locationId = await getLocationIdFromRequest(request);
  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  const start = from ? new Date(from) : new Date();
  start.setHours(0, 0, 0, 0);
  const end = to ? new Date(to) : new Date(start);
  end.setDate(end.getDate() + 7);
  end.setHours(23, 59, 59, 999);

  const [reservations, connections] = await Promise.all([
    prisma.tableReservation.findMany({
      where: {
        locationId,
        reservationAt: { gte: start, lte: end },
        status: { notIn: ["CANCELLED", "NO_SHOW"] },
      },
      include: { table: { select: { id: true, number: true, label: true } } },
      orderBy: { reservationAt: "asc" },
    }),
    prisma.reservationConnection.findMany({ where: { locationId } }),
  ]);

  return NextResponse.json({
    reservations,
    connections: RESERVATION_PROVIDERS.map((p) => {
      const conn = connections.find((c) => c.provider === p.id);
      return {
        ...p,
        connected: conn?.connected ?? false,
        restaurantExternalId: conn?.restaurantExternalId ?? null,
        restaurantName: conn?.restaurantName ?? null,
        autoSyncEnabled: conn?.autoSyncEnabled ?? true,
        lastSyncAt: conn?.lastSyncAt?.toISOString() ?? null,
        lastSyncStatus: conn?.lastSyncStatus ?? null,
        lastSyncMessage: conn?.lastSyncMessage ?? null,
      };
    }),
  });
}

export async function POST(request: NextRequest) {
  const { error } = await requirePermission(request, "manage_tables");
  if (error) return error;

  const locationId = await getLocationIdFromRequest(request);
  const body = await request.json();

  const reservation = await prisma.tableReservation.create({
    data: {
      locationId,
      provider: (body.provider as ReservationProvider) ?? "OPENTABLE",
      guestName: body.guestName,
      partySize: body.partySize ?? 2,
      reservationAt: new Date(body.reservationAt),
      durationMinutes: body.durationMinutes ?? 90,
      tableId: body.tableId ?? null,
      notes: body.notes ?? null,
      phone: body.phone ?? null,
      status: "CONFIRMED",
    },
    include: { table: { select: { id: true, number: true, label: true } } },
  });

  if (body.tableId) {
    await prisma.table.update({
      where: { id: body.tableId },
      data: { status: "reserved" },
    });
  }

  return NextResponse.json(reservation);
}
