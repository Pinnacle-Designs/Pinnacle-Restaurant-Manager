import type { ReservationProvider } from "@prisma/client";

export const RESERVATION_PROVIDERS: Array<{
  id: ReservationProvider;
  name: string;
  description: string;
}> = [
  {
    id: "OPENTABLE",
    name: "OpenTable",
    description: "Sync reservations, party size, and table assignments from OpenTable GuestCenter.",
  },
  {
    id: "RESY",
    name: "Resy",
    description: "Import Resy bookings and walk-in waitlist into your floor plan.",
  },
  {
    id: "TOCK",
    name: "Tock",
    description: "Prepaid experiences and tasting-menu reservations.",
  },
  {
    id: "YELP",
    name: "Yelp Guest Manager",
    description: "Waitlist and reservation sync from Yelp for Restaurants.",
  },
];

export function reservationProviderLabel(provider: ReservationProvider): string {
  return RESERVATION_PROVIDERS.find((p) => p.id === provider)?.name ?? provider;
}

export function hasLiveReservationCredentials(provider: ReservationProvider): boolean {
  if (provider === "OPENTABLE") {
    return Boolean(process.env.OPENTABLE_PARTNER_API_KEY || process.env.OPENTABLE_CLIENT_ID);
  }
  if (provider === "RESY") return Boolean(process.env.RESY_API_KEY);
  if (provider === "TOCK") return Boolean(process.env.TOCK_API_KEY);
  if (provider === "YELP") return Boolean(process.env.YELP_FUSION_API_KEY);
  return false;
}
