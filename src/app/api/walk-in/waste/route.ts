import { NextRequest, NextResponse } from "next/server";
import { getLocationIdFromRequest } from "@/lib/location";
import { requirePermission } from "@/lib/api-auth";
import { logWaste } from "@/lib/walk-in/waste";

export async function POST(request: NextRequest) {
  const { error } = await requirePermission(request, "manage_inventory");
  if (error) return error;

  const locationId = await getLocationIdFromRequest(request);
  const body = await request.json();

  const waste = await logWaste(locationId, {
    inventoryItemId: body.inventoryItemId,
    itemName: body.itemName ?? "Unknown",
    quantity: parseFloat(body.quantity),
    unit: body.unit ?? "each",
    reason: body.reason,
    countSessionId: body.countSessionId,
    lotId: body.lotId,
  });

  return NextResponse.json({ waste });
}
