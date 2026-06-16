import { NextRequest, NextResponse } from "next/server";
import { getLocationIdFromRequest } from "@/lib/location";
import { requirePermission } from "@/lib/api-auth";
import { getCrossVendorBids } from "@/lib/purchasing/vendor-bidding";

export async function GET(request: NextRequest) {
  const { error } = await requirePermission(request, "manage_inventory");
  if (error) return error;

  const locationId = await getLocationIdFromRequest(request);
  const bids = await getCrossVendorBids(locationId);
  const multiVendor = bids.filter((b) => b.vendors.length >= 2);
  const totalSavings = multiVendor.reduce(
    (s, b) => s + b.savingsAmount * Math.max(b.suggestedQty, 1),
    0
  );

  return NextResponse.json({
    bids,
    multiVendorCount: multiVendor.length,
    estimatedWeeklySavings: Math.round(totalSavings * 100) / 100,
  });
}
