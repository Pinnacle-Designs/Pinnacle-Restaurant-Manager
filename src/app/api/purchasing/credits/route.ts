import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getLocationIdFromRequest } from "@/lib/location";
import { requirePermission } from "@/lib/api-auth";

export async function GET(request: NextRequest) {
  const { error } = await requirePermission(request, "manage_inventory");
  if (error) return error;

  const locationId = await getLocationIdFromRequest(request);
  const credits = await prisma.vendorCredit.findMany({
    where: { locationId },
    include: { invoice: true },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ credits });
}

export async function POST(request: NextRequest) {
  const { error } = await requirePermission(request, "manage_inventory");
  if (error) return error;

  const locationId = await getLocationIdFromRequest(request);
  const body = await request.json();

  const vendor = String(body.vendor || "").trim();
  const amount = parseFloat(body.amount);
  const reason = String(body.reason || "").trim();

  if (!vendor || !Number.isFinite(amount) || amount <= 0 || !reason) {
    return NextResponse.json({ error: "Vendor, amount, and reason required" }, { status: 400 });
  }

  const credit = await prisma.vendorCredit.create({
    data: {
      locationId,
      vendor,
      amount,
      reason,
      creditMemoNo: body.creditMemoNo ?? null,
      invoiceId: body.invoiceId ?? null,
      itemsJson: body.items ? JSON.stringify(body.items) : null,
      status: "OPEN",
    },
  });

  await prisma.businessInsight.create({
    data: {
      locationId,
      title: `Credit memo pending: ${vendor}`,
      description: `$${amount.toFixed(2)} credit for ${reason}. Alert bookkeeper to confirm vendor issues credit memo.`,
      category: "FINANCE",
      severity: "MEDIUM",
      actionable: "Follow up with vendor AP department",
      dataSnapshot: JSON.stringify({ creditId: credit.id, amount, vendor }),
    },
  });

  await prisma.activityLog.create({
    data: {
      locationId,
      action: "CREATE",
      entity: "vendor_credit",
      entityId: credit.id,
      details: `Credit logged: ${vendor} $${amount.toFixed(2)} — ${reason}`,
    },
  });

  return NextResponse.json({ credit });
}

export async function PATCH(request: NextRequest) {
  const { error } = await requirePermission(request, "manage_inventory");
  if (error) return error;

  const locationId = await getLocationIdFromRequest(request);
  const body = await request.json();
  const id = body.id as string;
  const status = body.status as string;

  if (!id || !status) {
    return NextResponse.json({ error: "id and status required" }, { status: 400 });
  }

  const credit = await prisma.vendorCredit.findFirst({ where: { id, locationId } });
  if (!credit) {
    return NextResponse.json({ error: "Credit not found" }, { status: 404 });
  }

  const updated = await prisma.vendorCredit.update({
    where: { id },
    data: {
      status,
      resolvedAt: status === "APPLIED" || status === "CLOSED" ? new Date() : null,
      creditMemoNo: body.creditMemoNo ?? credit.creditMemoNo,
    },
  });

  return NextResponse.json({ credit: updated });
}
