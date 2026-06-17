import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getLocationIdFromRequest } from "@/lib/location";

export async function GET(request: NextRequest) {
  const locationId = await getLocationIdFromRequest(request);
  const tables = await prisma.table.findMany({
    where: { locationId },
    orderBy: { number: "asc" },
    include: {
      orders: {
        where: { status: { notIn: ["PAID", "CANCELLED"] } },
        take: 1,
        orderBy: { createdAt: "desc" },
      },
    },
  });
  return NextResponse.json(tables);
}

export async function POST(request: NextRequest) {
  const locationId = await getLocationIdFromRequest(request);
  const body = await request.json();
  const table = await prisma.table.create({
    data: {
      locationId,
      number: body.number,
      label: body.label ?? null,
      capacity: body.capacity ?? 4,
      status: body.status ?? "available",
      section: body.section ?? "main",
      shape: body.shape ?? "round",
      posX: body.posX ?? 100,
      posY: body.posY ?? 100,
      width: body.width ?? 72,
      height: body.height ?? 72,
      rotation: body.rotation ?? 0,
    },
  });

  await prisma.activityLog.create({
    data: {
      locationId,
      action: "CREATE",
      entity: "table",
      entityId: table.id,
      details: `Added table ${table.number}`,
    },
  });

  return NextResponse.json(table);
}
