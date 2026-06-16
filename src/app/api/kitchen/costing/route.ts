import { NextRequest, NextResponse } from "next/server";
import { getLocationIdFromRequest } from "@/lib/location";
import { requirePermission } from "@/lib/api-auth";
import { recalculateAllRecipeCosts } from "@/lib/kitchen/dynamic-costing";

export async function POST(request: NextRequest) {
  const { error } = await requirePermission(request, "manage_menu");
  if (error) return error;

  const locationId = await getLocationIdFromRequest(request);
  const results = await recalculateAllRecipeCosts(locationId);

  return NextResponse.json({ updated: results.length, costing: results });
}
