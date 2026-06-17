import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();

  const table = await prisma.table.update({
    where: { id },
    data: {
      number: body.number,
      label: body.label,
      capacity: body.capacity,
      status: body.status,
      section: body.section,
      shape: body.shape,
      posX: body.posX,
      posY: body.posY,
      width: body.width,
      height: body.height,
      rotation: body.rotation,
    },
  });

  return NextResponse.json(table);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await prisma.table.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
