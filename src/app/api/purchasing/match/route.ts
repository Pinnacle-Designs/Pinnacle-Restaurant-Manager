import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getLocationIdFromRequest } from "@/lib/location";
import { requirePermission } from "@/lib/api-auth";
import { runThreeWayMatch } from "@/lib/purchasing/three-way-match";

export async function POST(request: NextRequest) {
  const { error } = await requirePermission(request, "manage_inventory");
  if (error) return error;

  const body = await request.json();
  const invoiceId = body.invoiceId as string;
  if (!invoiceId) {
    return NextResponse.json({ error: "invoiceId required" }, { status: 400 });
  }

  const locationId = await getLocationIdFromRequest(request);
  const invoice = await prisma.vendorInvoice.findFirst({
    where: { id: invoiceId, locationId },
  });
  if (!invoice) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }

  const match = await runThreeWayMatch(invoiceId);
  return NextResponse.json({ match });
}
