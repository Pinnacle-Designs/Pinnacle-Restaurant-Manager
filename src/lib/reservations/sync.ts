import { prisma } from "@/lib/prisma";
import type { ReservationProvider } from "@prisma/client";
import { hasLiveReservationCredentials, reservationProviderLabel } from "./providers";

const DEMO_GUESTS = [
  { name: "Jordan Lee", party: 2 },
  { name: "The Martinez Family", party: 4 },
  { name: "Chris & Sam", party: 2 },
  { name: "Corporate dinner — Apex", party: 6 },
  { name: "Birthday — Taylor", party: 5 },
  { name: "Anniversary — Kim & Pat", party: 2 },
];

function upcomingSlots(count: number): Date[] {
  const now = new Date();
  const slots: Date[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(now);
    d.setMinutes(0, 0, 0);
    d.setHours(d.getHours() + 1 + i * 2);
    if (d < now) d.setDate(d.getDate() + 1);
    slots.push(d);
  }
  return slots;
}

async function syncDemoReservations(locationId: string, provider: ReservationProvider) {
  const tables = await prisma.table.findMany({
    where: { locationId },
    orderBy: { number: "asc" },
  });
  const slots = upcomingSlots(4);
  let created = 0;

  for (let i = 0; i < slots.length; i++) {
    const guest = DEMO_GUESTS[i % DEMO_GUESTS.length];
    const externalId = `demo-${provider}-${slots[i].toISOString().slice(0, 13)}-${i}`;
    const existing = await prisma.tableReservation.findFirst({
      where: { locationId, provider, externalId },
    });
    if (existing) continue;

    const fitting = tables.filter((t) => t.capacity >= guest.party);
    const table = fitting[i % Math.max(fitting.length, 1)];

    await prisma.tableReservation.create({
      data: {
        locationId,
        provider,
        externalId,
        guestName: guest.name,
        partySize: guest.party,
        reservationAt: slots[i],
        durationMinutes: 90,
        status: "CONFIRMED",
        tableId: table?.id,
        notes: `Synced from ${reservationProviderLabel(provider)} (demo)`,
      },
    });
    created++;

    if (table && table.status === "available") {
      const minsUntil = (slots[i].getTime() - Date.now()) / 60000;
      if (minsUntil <= 30 && minsUntil >= 0) {
        await prisma.table.update({
          where: { id: table.id },
          data: { status: "reserved" },
        });
      }
    }
  }

  return created;
}

export async function syncReservationsFromProvider(
  locationId: string,
  provider: ReservationProvider
) {
  const conn = await prisma.reservationConnection.findUnique({
    where: { locationId_provider: { locationId, provider } },
  });
  if (!conn?.connected) {
    throw new Error(`${reservationProviderLabel(provider)} is not connected`);
  }

  const live = hasLiveReservationCredentials(provider);
  let created = 0;
  let message: string;

  if (!live) {
    created = await syncDemoReservations(locationId, provider);
    message = `Demo sync: ${created} new reservation(s) imported.`;
  } else {
    // Live partner APIs require OAuth + restaurant mapping — placeholder for production wiring.
    message =
      "Live API credentials configured. Complete OpenTable/Resy partner onboarding to enable full pull sync.";
  }

  await prisma.reservationConnection.update({
    where: { locationId_provider: { locationId, provider } },
    data: {
      lastSyncAt: new Date(),
      lastSyncStatus: live ? "pending_live" : "demo_ok",
      lastSyncMessage: message,
    },
  });

  return { created, message, live };
}

export async function syncAllReservationProviders(locationId: string) {
  const conns = await prisma.reservationConnection.findMany({
    where: { locationId, connected: true, autoSyncEnabled: true },
  });
  const results = [];
  for (const conn of conns) {
    const r = await syncReservationsFromProvider(locationId, conn.provider);
    results.push({ provider: conn.provider, ...r });
  }
  return results;
}
