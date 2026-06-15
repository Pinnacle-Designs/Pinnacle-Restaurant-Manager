import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getLocationIdFromRequest } from "@/lib/location";
import { requirePermission } from "@/lib/api-auth";
import { isMenuChannelId } from "@/lib/menu/channels";
import {
  getMenuChannelConfigs,
  publishMenuToChannel,
} from "@/lib/menu/publish";

export async function GET(request: NextRequest) {
  const { error } = await requirePermission(request, "manage_menu");
  if (error) return error;

  const locationId = await getLocationIdFromRequest(request);
  const configs = await getMenuChannelConfigs(locationId);

  const location = await prisma.location.findUnique({
    where: { id: locationId },
    select: { menuRevision: true, name: true },
  });

  return NextResponse.json({
    menuRevision: location?.menuRevision ?? 0,
    locationName: location?.name ?? "",
    channels: configs,
  });
}

export async function PATCH(request: NextRequest) {
  const { error } = await requirePermission(request, "manage_menu");
  if (error) return error;

  const locationId = await getLocationIdFromRequest(request);
  const body = await request.json();

  if (!body.channel || !isMenuChannelId(body.channel)) {
    return NextResponse.json({ error: "Invalid channel" }, { status: 400 });
  }

  const data: {
    enabled?: boolean;
    priceMarkupPct?: number;
    externalStoreId?: string | null;
  } = {};

  if (typeof body.enabled === "boolean") data.enabled = body.enabled;
  if (typeof body.priceMarkupPct === "number" && body.priceMarkupPct >= 0 && body.priceMarkupPct <= 100) {
    data.priceMarkupPct = body.priceMarkupPct;
  }
  if (body.externalStoreId !== undefined) {
    data.externalStoreId = body.externalStoreId ? String(body.externalStoreId) : null;
  }

  const updated = await prisma.menuChannelConfig.update({
    where: { locationId_channel: { locationId, channel: body.channel } },
    data,
  });

  if (body.syncAfterUpdate === true) {
    await publishMenuToChannel(locationId, body.channel);
  }

  const configs = await getMenuChannelConfigs(locationId);
  const channel = configs.find((c) => c.channel === body.channel);

  return NextResponse.json(channel ?? updated);
}
