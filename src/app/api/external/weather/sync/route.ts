import { NextRequest, NextResponse } from "next/server";
import { getLocationIdFromRequest } from "@/lib/location";
import { requirePermission } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { syncWeatherForecasts } from "@/lib/external/sync-weather";

export async function POST(request: NextRequest) {
  const { error } = await requirePermission(request, "view_analytics");
  if (error) return error;

  try {
    const locationId = await getLocationIdFromRequest(request);
    const location = await prisma.location.findUnique({ where: { id: locationId } });
    if (!location) {
      return NextResponse.json({ error: "Location not found" }, { status: 404 });
    }

    const result = await syncWeatherForecasts(locationId, location);
    return NextResponse.json(result);
  } catch (err) {
    console.error("Weather sync error:", err);
    return NextResponse.json({ error: "Weather sync failed" }, { status: 500 });
  }
}
