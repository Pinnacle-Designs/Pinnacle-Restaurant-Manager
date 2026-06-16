import { NextRequest, NextResponse } from "next/server";
import { getLocationIdFromRequest } from "@/lib/location";
import { requirePermission } from "@/lib/api-auth";
import { getVendorScorecardSummary } from "@/lib/purchasing/vendor-scorecards";

export async function GET(request: NextRequest) {
  const { error } = await requirePermission(request, "manage_inventory");
  if (error) return error;

  const locationId = await getLocationIdFromRequest(request);
  const days = parseInt(request.nextUrl.searchParams.get("days") || "90", 10);
  const summary = await getVendorScorecardSummary(locationId);

  return NextResponse.json(summary);
}
