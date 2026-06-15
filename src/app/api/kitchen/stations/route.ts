import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getLocationIdFromRequest } from "@/lib/location";
import { requirePermission } from "@/lib/api-auth";
import { ensureKitchenStations } from "@/lib/kitchen/stations";

export async function GET(request: NextRequest) {
  const { error } = await requirePermission(request, "manage_menu");
  if (error) return error;

  const locationId = await getLocationIdFromRequest(request);
  const stations = await ensureKitchenStations(locationId);
  return NextResponse.json(stations);
}

export async function POST(request: NextRequest) {
  const { error } = await requirePermission(request, "manage_menu");
  if (error) return error;

  const locationId = await getLocationIdFromRequest(request);
  const body = await request.json();
  const name = String(body.name ?? "").trim();
  const slug = String(body.slug ?? name.toLowerCase().replace(/[^a-z0-9]+/g, "-")).trim();
  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const station = await prisma.kitchenStation.create({
    data: {
      locationId,
      name,
      slug,
      outputKind: body.outputKind === "PRINTER" ? "PRINTER" : "KDS",
      color: body.color ?? null,
      sortOrder: body.sortOrder ?? 0,
    },
  });

  return NextResponse.json(station);
}
