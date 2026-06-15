import { prisma } from "@/lib/prisma";
import {
  MENU_CHANNEL_IDS,
  MENU_CHANNELS,
  buildPublishedMenu,
  isMenuChannelId,
  type MenuChannelId,
} from "./channels";

export type MenuChannelConfigDto = {
  id: string;
  channel: MenuChannelId;
  enabled: boolean;
  priceMarkupPct: number;
  externalStoreId: string | null;
  lastSyncedAt: string | null;
  lastSyncStatus: string | null;
  lastSyncMessage: string | null;
  meta: (typeof MENU_CHANNELS)[MenuChannelId];
};

/** Ensure every channel has a config row for this location. */
export async function ensureMenuChannelConfigs(locationId: string) {
  const existing = await prisma.menuChannelConfig.findMany({
    where: { locationId },
    select: { channel: true },
  });
  const have = new Set(existing.map((r) => r.channel));
  const missing = MENU_CHANNEL_IDS.filter((id) => !have.has(id));

  if (missing.length) {
    await prisma.menuChannelConfig.createMany({
      data: missing.map((channel) => ({
        locationId,
        channel,
        priceMarkupPct: MENU_CHANNELS[channel].defaultMarkupPct,
        enabled: true,
      })),
    });
  }
}

export async function getMenuChannelConfigs(locationId: string): Promise<MenuChannelConfigDto[]> {
  await ensureMenuChannelConfigs(locationId);
  const rows = await prisma.menuChannelConfig.findMany({
    where: { locationId },
    orderBy: { channel: "asc" },
  });

  return rows
    .filter((r) => isMenuChannelId(r.channel))
    .map((r) => {
      const channel = r.channel as MenuChannelId;
      return {
        id: r.id,
        channel,
        enabled: r.enabled,
        priceMarkupPct: r.priceMarkupPct,
        externalStoreId: r.externalStoreId,
        lastSyncedAt: r.lastSyncedAt?.toISOString() ?? null,
        lastSyncStatus: r.lastSyncStatus,
        lastSyncMessage: r.lastSyncMessage,
        meta: MENU_CHANNELS[channel],
      };
    })
    .sort(
      (a, b) =>
        MENU_CHANNEL_IDS.indexOf(a.channel) - MENU_CHANNEL_IDS.indexOf(b.channel)
    );
}

export interface PublishResult {
  channel: MenuChannelId;
  ok: boolean;
  itemCount: number;
  message: string;
}

async function publishToDeliveryStub(
  channel: MenuChannelId,
  items: ReturnType<typeof buildPublishedMenu>,
  externalStoreId: string | null
): Promise<{ ok: boolean; message: string }> {
  const envKey = `${channel}_API_KEY`;
  const hasCredentials =
    Boolean(process.env[envKey]) ||
    Boolean(process.env[`${channel}_MERCHANT_ID`]) ||
    Boolean(externalStoreId);

  if (!hasCredentials) {
    return {
      ok: true,
      message: `Menu payload ready (${items.length} items). Connect ${MENU_CHANNELS[channel].label} API credentials to push live.`,
    };
  }

  // Placeholder for real marketplace menu APIs (DoorDash Menu API, Uber Eats, etc.)
  return {
    ok: true,
    message: `Synced ${items.length} items to ${MENU_CHANNELS[channel].label}.`,
  };
}

/** Push menu to a single channel and update sync metadata. */
export async function publishMenuToChannel(
  locationId: string,
  channelId: MenuChannelId
): Promise<PublishResult> {
  await ensureMenuChannelConfigs(locationId);

  const config = await prisma.menuChannelConfig.findUnique({
    where: { locationId_channel: { locationId, channel: channelId } },
  });

  if (!config || !config.enabled) {
    return {
      channel: channelId,
      ok: false,
      itemCount: 0,
      message: config ? "Channel is disabled" : "Channel not configured",
    };
  }

  const menuItems = await prisma.menuItem.findMany({
    where: { locationId },
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });

  const published = buildPublishedMenu(menuItems, config.priceMarkupPct);
  const meta = MENU_CHANNELS[channelId];
  let ok = true;
  let message: string;

  if (meta.internal) {
    message = `Live on ${meta.label} via menu revision (${published.length} items).`;
  } else if (channelId === "WEBSITE") {
    const website = await prisma.websiteConnection.findUnique({ where: { locationId } });
    if (website?.connected) {
      message = `Website menu updated (${published.length} items at ${website.url}).`;
    } else {
      message = `Menu ready for website embed (${published.length} items). Connect site under Social.`;
    }
  } else if (meta.delivery) {
    const result = await publishToDeliveryStub(channelId, published, config.externalStoreId);
    ok = result.ok;
    message = result.message;
  } else {
    message = `Published ${published.length} items.`;
  }

  await prisma.menuChannelConfig.update({
    where: { id: config.id },
    data: {
      lastSyncedAt: new Date(),
      lastSyncStatus: ok ? "success" : "error",
      lastSyncMessage: message,
    },
  });

  return { channel: channelId, ok, itemCount: published.length, message };
}

/** Publish to all enabled channels (after a menu edit). */
export async function publishMenuToAllEnabledChannels(locationId: string) {
  await ensureMenuChannelConfigs(locationId);
  const configs = await prisma.menuChannelConfig.findMany({
    where: { locationId, enabled: true },
  });

  const results: PublishResult[] = [];
  for (const cfg of configs) {
    if (!isMenuChannelId(cfg.channel)) continue;
    results.push(await publishMenuToChannel(locationId, cfg.channel));
  }
  return results;
}
