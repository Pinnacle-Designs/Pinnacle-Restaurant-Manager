import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getLocationIdFromRequest } from "@/lib/location";
import { requirePermission } from "@/lib/api-auth";
import { generatePoSuggestions, createPurchaseOrder } from "@/lib/purchasing/suggest-orders";

export async function GET(request: NextRequest) {
  const { error } = await requirePermission(request, "manage_inventory");
  if (error) return error;

  const locationId = await getLocationIdFromRequest(request);
  const suggestions = await generatePoSuggestions(locationId);
  return NextResponse.json({ suggestions });
}

export async function POST(request: NextRequest) {
  const { error } = await requirePermission(request, "manage_inventory");
  if (error) return error;

  const locationId = await getLocationIdFromRequest(request);
  const body = await request.json();
  const lines = body.lines as { inventoryItemId: string; qty: number; unitPrice?: number }[];

  if (!Array.isArray(lines) || lines.length === 0) {
    return NextResponse.json({ error: "At least one line required" }, { status: 400 });
  }

  const po = await createPurchaseOrder(locationId, lines, {
    vendor: body.vendor,
    source: body.source ?? "SUGGESTED",
    status: body.status ?? "SUBMITTED",
  });

  return NextResponse.json({ po });
}
