import { NextRequest, NextResponse } from "next/server";
import { getLocationIdFromRequest } from "@/lib/location";
import { requirePermission } from "@/lib/api-auth";
import {
  runThreeWayMatch,
  getThreeWayMatchSummary,
  getThreeWayMatchDetail,
} from "@/lib/purchasing/three-way-match";

export async function GET(request: NextRequest) {
  const { error } = await requirePermission(request, "manage_inventory");
  if (error) return error;

  const locationId = await getLocationIdFromRequest(request);
  const invoiceId = request.nextUrl.searchParams.get("invoiceId");

  if (invoiceId) {
    const detail = await getThreeWayMatchDetail(invoiceId, locationId);
    if (!detail) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }
    return NextResponse.json(detail);
  }

  const summary = await getThreeWayMatchSummary(locationId);
  return NextResponse.json(summary);
}

export async function POST(request: NextRequest) {
  const { error } = await requirePermission(request, "manage_inventory");
  if (error) return error;

  const body = await request.json();
  const invoiceId = body.invoiceId as string;
  if (!invoiceId) {
    return NextResponse.json({ error: "invoiceId required" }, { status: 400 });
  }

  const locationId = await getLocationIdFromRequest(request);
  const { prisma } = await import("@/lib/prisma");
  const invoice = await prisma.vendorInvoice.findFirst({
    where: { id: invoiceId, locationId },
  });
  if (!invoice) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }

  const match = await runThreeWayMatch(invoiceId);
  return NextResponse.json({ match });
}
