import { NextRequest, NextResponse } from "next/server";
import { getLocationIdFromRequest } from "@/lib/location";
import { requirePermission } from "@/lib/api-auth";
import { approveAndTransmitPurchaseOrder } from "@/lib/purchasing/transmit-po";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requirePermission(request, "manage_inventory");
  if (error) return error;

  const locationId = await getLocationIdFromRequest(request);
  const { id } = await params;

  try {
    const result = await approveAndTransmitPurchaseOrder(locationId, id);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Approve failed" },
      { status: 400 }
    );
  }
}
