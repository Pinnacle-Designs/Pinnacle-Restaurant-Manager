import { NextRequest, NextResponse } from "next/server";
import { getLocationIdFromRequest } from "@/lib/location";
import { requirePermission } from "@/lib/api-auth";
import { computeAnalytics } from "@/lib/analytics/compute";

export async function GET(request: NextRequest) {
  const { error } = await requirePermission(request, "view_analytics");
  if (error) return error;

  try {
    const locationId = await getLocationIdFromRequest(request);
    const data = await computeAnalytics(locationId);
    return NextResponse.json(data);
  } catch (err) {
    console.error("Analytics API error:", err);
    const message =
      err instanceof Error ? err.message : "Failed to compute analytics";
    return NextResponse.json(
      {
        error:
          message.includes("vendorPriceHistory") || message.includes("no such table")
            ? "Database schema out of date. Run: npm run db:push"
            : message,
      },
      { status: 500 }
    );
  }
}
