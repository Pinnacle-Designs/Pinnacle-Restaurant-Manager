import { NextRequest, NextResponse } from "next/server";
import { getLocationIdFromRequest } from "@/lib/location";
import { requirePermission } from "@/lib/api-auth";
import { computeTurnoverAnalytics } from "@/lib/retention/turnover";

export async function GET(request: NextRequest) {
  const { error } = await requirePermission(request, "manage_retention");
  if (error) return error;

  const locationId = await getLocationIdFromRequest(request);
  const months = parseInt(request.nextUrl.searchParams.get("months") || "12", 10);
  const analytics = await computeTurnoverAnalytics(locationId, Math.min(24, Math.max(3, months)));

  return NextResponse.json(analytics);
}
