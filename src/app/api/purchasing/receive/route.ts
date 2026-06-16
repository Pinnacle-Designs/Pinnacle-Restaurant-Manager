import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getLocationIdFromRequest } from "@/lib/location";
import { requirePermission } from "@/lib/api-auth";
import { receiveGoods } from "@/lib/purchasing/receive";

export async function POST(request: NextRequest) {
  const { error } = await requirePermission(request, "manage_inventory");
  if (error) return error;

  const locationId = await getLocationIdFromRequest(request);
  const body = await request.json();

  const vendor = String(body.vendor || "").trim();
  const lines = body.lines as {
    poLineId?: string;
    inventoryItemId?: string;
    description: string;
    qtyReceived: number;
    unit: string;
    unitCost: number;
  }[];

  if (!vendor || !Array.isArray(lines) || lines.length === 0) {
    return NextResponse.json({ error: "Vendor and lines required" }, { status: 400 });
  }

  const receipt = await receiveGoods(locationId, vendor, lines, {
    poId: body.poId,
    receivedBy: body.receivedBy,
    notes: body.notes,
  });

  return NextResponse.json({ receipt });
}

export async function GET(request: NextRequest) {
  const { error } = await requirePermission(request, "manage_inventory");
  if (error) return error;

  const locationId = await getLocationIdFromRequest(request);
  const receipts = await prisma.goodsReceipt.findMany({
    where: { locationId },
    include: { lines: true, po: true },
    orderBy: { receivedAt: "desc" },
    take: 30,
  });

  return NextResponse.json({ receipts });
}
