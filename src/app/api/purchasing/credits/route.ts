import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getLocationIdFromRequest } from "@/lib/location";
import { requirePermission } from "@/lib/api-auth";
import { submitCreditMemoRequest, applyCreditMemo } from "@/lib/purchasing/credit-memo";

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
  const { user, error } = await requirePermission(request, "manage_inventory");
  if (error) return error;

  const locationId = await getLocationIdFromRequest(request);
  const body = await request.json();

  const vendor = String(body.vendor || "").trim();
  const amount = parseFloat(body.amount);
  const reason = String(body.reason || "").trim();

  if (!vendor || !Number.isFinite(amount) || amount <= 0 || !reason) {
    return NextResponse.json({ error: "Vendor, amount, and reason required" }, { status: 400 });
  }

  const result = await submitCreditMemoRequest(locationId, {
    vendor,
    amount,
    reason,
    category: body.category ?? "DAMAGED",
    invoiceId: body.invoiceId ?? null,
    photoUrl: body.photoUrl ?? null,
    repEmail: body.repEmail ?? null,
    reportedBy: user?.name ?? user?.email ?? null,
    items: body.items,
  });

  return NextResponse.json({
    credit: result.credit,
    email: result.email,
    accountingLocked: result.accountingLocked,
    repEmail: result.repEmail,
  });
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

  if (status === "APPLIED") {
    const updated = await applyCreditMemo(locationId, id, {
      creditMemoNo: body.creditMemoNo,
    });
    return NextResponse.json({ credit: updated, accountingUnlocked: true });
  }

  const credit = await prisma.vendorCredit.findFirst({ where: { id, locationId } });
  if (!credit) {
    return NextResponse.json({ error: "Credit not found" }, { status: 404 });
  }

  const updated = await prisma.vendorCredit.update({
    where: { id },
    data: {
      status,
      resolvedAt: status === "CLOSED" ? new Date() : null,
      creditMemoNo: body.creditMemoNo ?? credit.creditMemoNo,
    },
  });

  return NextResponse.json({ credit: updated });
}
