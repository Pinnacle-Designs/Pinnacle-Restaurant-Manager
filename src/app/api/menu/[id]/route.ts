import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { onMenuChanged } from "@/lib/menu/on-menu-change";
import { normalizeSalesCategory } from "@/lib/menu/sales-categories";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();

  const existing = await prisma.menuItem.findUnique({
    where: { id },
    select: { locationId: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const item = await prisma.menuItem.update({
    where: { id },
    data: {
      name: body.name,
      description: body.description,
      price: body.price,
      category: body.category,
      available: body.available,
      imageUrl: body.imageUrl,
      kitchenStationId: body.kitchenStationId ?? undefined,
      defaultCourse: body.defaultCourse ?? undefined,
      isCombo: body.isCombo ?? undefined,
      salesCategory: body.salesCategory ? normalizeSalesCategory(body.salesCategory) : undefined,
    },
  });

  await onMenuChanged(existing.locationId);

  return NextResponse.json(item);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const existing = await prisma.menuItem.findUnique({
    where: { id },
    select: { locationId: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.menuItem.delete({ where: { id } });
  await onMenuChanged(existing.locationId);

  return NextResponse.json({ success: true });
}
