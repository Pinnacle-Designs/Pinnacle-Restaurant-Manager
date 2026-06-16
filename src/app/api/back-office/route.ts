import { NextRequest, NextResponse } from "next/server";
import { getLocationIdFromRequest } from "@/lib/location";
import { requirePermission } from "@/lib/api-auth";
import { computeAvtVariance } from "@/lib/back-office/avt-variance";
import { computeLiveCogs } from "@/lib/back-office/live-cogs";
import { computeWasteDashboard } from "@/lib/back-office/waste-dashboard";
import { computeMenuEngineering } from "@/lib/menu/engineering";

export async function GET(request: NextRequest) {
  const { error } = await requirePermission(request, "view_analytics");
  if (error) return error;

  const locationId = await getLocationIdFromRequest(request);

  const [avt, liveCogs, waste, menuEngineering] = await Promise.all([
    computeAvtVariance(locationId),
    computeLiveCogs(locationId),
    computeWasteDashboard(locationId),
    computeMenuEngineering(locationId),
  ]);

  return NextResponse.json({ avt, liveCogs, waste, menuEngineering });
}
