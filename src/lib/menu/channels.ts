/** Omnichannel menu destinations — single source of truth with per-channel markup. */

export const MENU_CHANNEL_IDS = [
  "POS",
  "TABLESIDE",
  "WEBSITE",
  "DOORDASH",
  "UBER_EATS",
  "GRUBHUB",
] as const;

export type MenuChannelId = (typeof MENU_CHANNEL_IDS)[number];

export interface MenuChannelMeta {
  id: MenuChannelId;
  label: string;
  shortLabel: string;
  description: string;
  defaultMarkupPct: number;
  /** Instant via menuRevision poll — no external API */
  internal: boolean;
  /** Third-party delivery marketplace */
  delivery: boolean;
}

export const MENU_CHANNELS: Record<MenuChannelId, MenuChannelMeta> = {
  POS: {
    id: "POS",
    label: "In-store POS",
    shortLabel: "POS",
    description: "Server POS, checks, and in-house ordering",
    defaultMarkupPct: 0,
    internal: true,
    delivery: false,
  },
  TABLESIDE: {
    id: "TABLESIDE",
    label: "QR tableside menu",
    shortLabel: "Tableside",
    description: "Guest-facing QR menus at the table",
    defaultMarkupPct: 0,
    internal: true,
    delivery: false,
  },
  WEBSITE: {
    id: "WEBSITE",
    label: "Restaurant website",
    shortLabel: "Website",
    description: "Online ordering and menu embed on your site",
    defaultMarkupPct: 0,
    internal: false,
    delivery: false,
  },
  DOORDASH: {
    id: "DOORDASH",
    label: "DoorDash",
    shortLabel: "DoorDash",
    description: "Third-party delivery marketplace",
    defaultMarkupPct: 15,
    internal: false,
    delivery: true,
  },
  UBER_EATS: {
    id: "UBER_EATS",
    label: "Uber Eats",
    shortLabel: "Uber Eats",
    description: "Third-party delivery marketplace",
    defaultMarkupPct: 15,
    internal: false,
    delivery: true,
  },
  GRUBHUB: {
    id: "GRUBHUB",
    label: "Grubhub",
    shortLabel: "Grubhub",
    description: "Third-party delivery marketplace",
    defaultMarkupPct: 15,
    internal: false,
    delivery: true,
  },
};

export function isMenuChannelId(value: string): value is MenuChannelId {
  return MENU_CHANNEL_IDS.includes(value as MenuChannelId);
}

/** Apply channel markup to base menu price (e.g. +15% on DoorDash). */
export function applyChannelMarkup(basePrice: number, markupPct: number): number {
  if (!markupPct) return basePrice;
  return Math.round(basePrice * (1 + markupPct / 100) * 100) / 100;
}

export interface PublishedMenuItem {
  id: string;
  name: string;
  description: string | null;
  category: string;
  basePrice: number;
  channelPrice: number;
  markupPct: number;
  available: boolean;
  imageUrl: string | null;
}

export function buildPublishedMenu(
  items: Array<{
    id: string;
    name: string;
    description: string | null;
    price: number;
    category: string;
    available: boolean;
    imageUrl: string | null;
  }>,
  markupPct: number
): PublishedMenuItem[] {
  return items
    .filter((item) => item.available)
    .map((item) => ({
      id: item.id,
      name: item.name,
      description: item.description,
      category: item.category,
      basePrice: item.price,
      channelPrice: applyChannelMarkup(item.price, markupPct),
      markupPct,
      available: item.available,
      imageUrl: item.imageUrl,
    }));
}
