import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getLocationIdFromRequest } from "@/lib/location";
import { requirePermission } from "@/lib/api-auth";

export async function GET(request: NextRequest) {
  const { error } = await requirePermission(request, "manage_inventory");
  if (error) return error;

  const locationId = await getLocationIdFromRequest(request);
  const orders = await prisma.vendorPurchaseOrder.findMany({
    where: { locationId },
    include: { lines: true, receipts: { include: { lines: true } }, invoices: true },
    orderBy: { submittedAt: "desc" },
    take: 50,
  });

  return NextResponse.json({ orders });
}
