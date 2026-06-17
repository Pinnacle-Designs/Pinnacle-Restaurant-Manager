import { NextRequest, NextResponse } from "next/server";
import { getLocationIdFromRequest } from "@/lib/location";
import { requirePermission } from "@/lib/api-auth";
import {
  connectReservationProvider,
  disconnectReservationProvider,
} from "@/lib/reservations/connection";
import type { ReservationProvider } from "@prisma/client";

export async function POST(request: NextRequest) {
  const { error } = await requirePermission(request, "manage_tables");
  if (error) return error;

  const locationId = await getLocationIdFromRequest(request);
  const body = await request.json();
  const provider = body.provider as ReservationProvider;
  const action = body.action as "connect" | "disconnect";

  if (!provider) {
    return NextResponse.json({ error: "provider is required" }, { status: 400 });
  }

  if (action === "disconnect") {
    await disconnectReservationProvider(locationId, provider);
    return NextResponse.json({ success: true, connected: false });
  }

  const conn = await connectReservationProvider(locationId, provider, {
    restaurantId: body.restaurantId,
    restaurantName: body.restaurantName,
  });

  return NextResponse.json({
    success: true,
    connected: conn.connected,
    lastSyncStatus: conn.lastSyncStatus,
    lastSyncMessage: conn.lastSyncMessage,
  });
}
