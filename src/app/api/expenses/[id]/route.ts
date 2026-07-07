import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/api-auth";
import { getLocationIdFromRequest } from "@/lib/location";
import { tenantNotFoundResponse, tenantWhere } from "@/lib/tenant-resource";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requirePermission(request, "view_finances");
  if (error) return error;

  const { id } = await params;
  const locationId = await getLocationIdFromRequest(request);
  const body = await request.json();

  const existing = await prisma.expense.findFirst({
    where: tenantWhere(id, locationId),
    select: { id: true },
  });
  if (!existing) {
    return tenantNotFoundResponse();
  }

  const expense = await prisma.expense.update({
    where: tenantWhere(id, locationId),
    data: {
      description: body.description,
      amount: body.amount,
      category: body.category,
      date: body.date ? new Date(body.date) : undefined,
      receiptUrl: body.receiptUrl,
    },
  });

  return NextResponse.json(expense);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requirePermission(request, "view_finances");
  if (error) return error;

  const { id } = await params;
  const locationId = await getLocationIdFromRequest(request);
  const existing = await prisma.expense.findFirst({
    where: tenantWhere(id, locationId),
    select: { id: true },
  });
  if (!existing) {
    return tenantNotFoundResponse();
  }

  await prisma.expense.delete({ where: tenantWhere(id, locationId) });
  return NextResponse.json({ success: true });
}
