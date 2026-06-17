import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getLocationIdFromRequest } from "@/lib/location";
import { requirePermission } from "@/lib/api-auth";
import {
  ensureFloorPlanDefaults,
  fillMissingPositions,
  parseFloorPlanSections,
  serializeFloorPlanSections,
  type FloorPlanSection,
} from "@/lib/tables/floor-plan";

export async function GET(request: NextRequest) {
  const locationId = await getLocationIdFromRequest(request);
  await ensureFloorPlanDefaults(locationId);

  const location = await prisma.location.findUniqueOrThrow({
    where: { id: locationId },
    select: {
      floorPlanWidth: true,
      floorPlanHeight: true,
      floorPlanSections: true,
    },
  });

  const rawTables = await prisma.table.findMany({
    where: { locationId },
    orderBy: { number: "asc" },
    include: {
      orders: {
        where: { status: { notIn: ["PAID", "CANCELLED"] } },
        take: 1,
        orderBy: { createdAt: "desc" },
      },
      reservations: {
        where: {
          status: { in: ["CONFIRMED", "SEATED"] },
          reservationAt: { gte: new Date(Date.now() - 2 * 60 * 60 * 1000) },
        },
        orderBy: { reservationAt: "asc" },
        take: 1,
      },
    },
  });

  const tables = fillMissingPositions(
    rawTables,
    location.floorPlanWidth,
    location.floorPlanHeight
  );

  return NextResponse.json({
    width: location.floorPlanWidth,
    height: location.floorPlanHeight,
    sections: parseFloorPlanSections(location.floorPlanSections),
    tables,
  });
}

export async function PATCH(request: NextRequest) {
  const { error } = await requirePermission(request, "manage_tables");
  if (error) return error;

  const locationId = await getLocationIdFromRequest(request);
  const body = await request.json();

  if (body.width != null || body.height != null || body.sections != null) {
    await prisma.location.update({
      where: { id: locationId },
      data: {
        floorPlanWidth: body.width ?? undefined,
        floorPlanHeight: body.height ?? undefined,
        floorPlanSections:
          body.sections != null
            ? serializeFloorPlanSections(body.sections as FloorPlanSection[])
            : undefined,
      },
    });
  }

  if (Array.isArray(body.tables)) {
    for (const t of body.tables) {
      if (!t.id) continue;
      await prisma.table.update({
        where: { id: t.id },
        data: {
          posX: t.posX,
          posY: t.posY,
          width: t.width,
          height: t.height,
          rotation: t.rotation,
          shape: t.shape,
          section: t.section,
          label: t.label,
        },
      });
    }
  }

  const location = await prisma.location.findUniqueOrThrow({
    where: { id: locationId },
    select: {
      floorPlanWidth: true,
      floorPlanHeight: true,
      floorPlanSections: true,
    },
  });

  const tables = await prisma.table.findMany({
    where: { locationId },
    orderBy: { number: "asc" },
    include: {
      orders: {
        where: { status: { notIn: ["PAID", "CANCELLED"] } },
        take: 1,
        orderBy: { createdAt: "desc" },
      },
      reservations: {
        where: {
          status: { in: ["CONFIRMED", "SEATED"] },
          reservationAt: { gte: new Date(Date.now() - 2 * 60 * 60 * 1000) },
        },
        orderBy: { reservationAt: "asc" },
        take: 1,
      },
    },
  });

  return NextResponse.json({
    width: location.floorPlanWidth,
    height: location.floorPlanHeight,
    sections: parseFloorPlanSections(location.floorPlanSections),
    tables,
  });
}
