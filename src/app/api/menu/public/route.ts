import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getLocationIdFromRequest } from "@/lib/location";
import { getSessionUserFromRequest } from "@/lib/auth";
import {
  buildPublishedMenu,
  isMenuChannelId,
  MENU_CHANNELS,
  type MenuChannelId,
} from "@/lib/menu/channels";
import { ensureMenuChannelConfigs } from "@/lib/menu/publish";

/**
 * Public channel menu — POS/tableside QR, website embed, partner webhooks.
 * Auth optional: session location or ?locationId= for embeds.
 */
export async function GET(request: NextRequest) {
  const channelParam = request.nextUrl.searchParams.get("channel") ?? "TABLESIDE";
  if (!isMenuChannelId(channelParam)) {
    return NextResponse.json({ error: "Invalid channel" }, { status: 400 });
  }
  const channel = channelParam as MenuChannelId;

  let locationId = request.nextUrl.searchParams.get("locationId");
  if (!locationId) {
    const user = await getSessionUserFromRequest(request);
    if (user?.locationId) {
      locationId = user.locationId;
    } else {
      try {
        locationId = await getLocationIdFromRequest(request);
      } catch {
        return NextResponse.json({ error: "Location required" }, { status: 400 });
      }
    }
  }

  await ensureMenuChannelConfigs(locationId);

  const [location, config, items] = await Promise.all([
    prisma.location.findUnique({
      where: { id: locationId },
      select: { name: true, menuRevision: true },
    }),
    prisma.menuChannelConfig.findUnique({
      where: { locationId_channel: { locationId, channel } },
    }),
    prisma.menuItem.findMany({
      where: { locationId },
      orderBy: [{ category: "asc" }, { name: "asc" }],
    }),
  ]);

  if (!location) {
    return NextResponse.json({ error: "Location not found" }, { status: 404 });
  }

  if (config && !config.enabled) {
    return NextResponse.json({ error: "Channel disabled" }, { status: 403 });
  }

  const markupPct = config?.priceMarkupPct ?? MENU_CHANNELS[channel].defaultMarkupPct;
  const menu = buildPublishedMenu(items, markupPct);

  const grouped = menu.reduce(
    (acc, item) => {
      if (!acc[item.category]) acc[item.category] = [];
      acc[item.category].push(item);
      return acc;
    },
    {} as Record<string, typeof menu>
  );

  return NextResponse.json({
    channel,
    channelLabel: MENU_CHANNELS[channel].label,
    locationId,
    locationName: location.name,
    menuRevision: location.menuRevision,
    markupPct,
    itemCount: menu.length,
    categories: Object.keys(grouped),
    items: menu,
    grouped,
    syncedAt: config?.lastSyncedAt?.toISOString() ?? null,
  });
}
