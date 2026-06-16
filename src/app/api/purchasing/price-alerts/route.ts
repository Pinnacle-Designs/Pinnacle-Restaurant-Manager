import { NextRequest, NextResponse } from "next/server";
import { getLocationIdFromRequest } from "@/lib/location";
import { requirePermission } from "@/lib/api-auth";
import { getRecentPriceSpikes } from "@/lib/purchasing/price-alerts";

export async function GET(request: NextRequest) {
  const { error } = await requirePermission(request, "manage_inventory");
  if (error) return error;

  const locationId = await getLocationIdFromRequest(request);
  const spikes = await getRecentPriceSpikes(locationId);
  return NextResponse.json({ spikes });
}
