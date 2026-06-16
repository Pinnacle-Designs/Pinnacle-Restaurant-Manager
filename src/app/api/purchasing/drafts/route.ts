import { NextRequest, NextResponse } from "next/server";
import { getLocationIdFromRequest } from "@/lib/location";
import { requirePermission } from "@/lib/api-auth";
import { buildDraftPurchaseOrdersByVendor, listDraftPurchaseOrders } from "@/lib/purchasing/draft-orders";

export async function GET(request: NextRequest) {
  const { error } = await requirePermission(request, "manage_inventory");
  if (error) return error;

  const locationId = await getLocationIdFromRequest(request);
  const drafts = await listDraftPurchaseOrders(locationId);
  return NextResponse.json({ drafts });
}

export async function POST(request: NextRequest) {
  const { error } = await requirePermission(request, "manage_inventory");
  if (error) return error;

  const locationId = await getLocationIdFromRequest(request);
  const result = await buildDraftPurchaseOrdersByVendor(locationId);
  return NextResponse.json(result);
}
