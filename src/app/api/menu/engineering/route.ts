import { NextRequest, NextResponse } from "next/server";
import { getLocationIdFromRequest } from "@/lib/location";
import { requirePermission } from "@/lib/api-auth";
import { computeMenuEngineering } from "@/lib/menu/engineering";

export async function GET(request: NextRequest) {
  const { error } = await requirePermission(request, "manage_menu");
  if (error) return error;

  const locationId = await getLocationIdFromRequest(request);
  const days = parseInt(request.nextUrl.searchParams.get("days") ?? "30", 10);
  const snapshot = await computeMenuEngineering(locationId, Math.min(90, Math.max(7, days)));
  return NextResponse.json(snapshot);
}
