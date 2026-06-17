import { NextRequest, NextResponse } from "next/server";
import { getLocationIdFromRequest } from "@/lib/location";
import { requirePermission } from "@/lib/api-auth";
import {
  syncAllReservationProviders,
  syncReservationsFromProvider,
} from "@/lib/reservations/sync";
import type { ReservationProvider } from "@prisma/client";

export async function POST(request: NextRequest) {
  const { error } = await requirePermission(request, "manage_tables");
  if (error) return error;

  const locationId = await getLocationIdFromRequest(request);
  const body = await request.json().catch(() => ({}));
  const provider = body.provider as ReservationProvider | undefined;

  try {
    if (provider) {
      const result = await syncReservationsFromProvider(locationId, provider);
      return NextResponse.json({ results: [{ provider, ...result }] });
    }
    const results = await syncAllReservationProviders(locationId);
    return NextResponse.json({ results });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Sync failed" },
      { status: 400 }
    );
  }
}
