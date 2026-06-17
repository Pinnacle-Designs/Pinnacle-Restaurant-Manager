import { prisma } from "@/lib/prisma";
import type { ReservationProvider } from "@prisma/client";
import { hasLiveReservationCredentials, reservationProviderLabel } from "./providers";

export async function connectReservationProvider(
  locationId: string,
  provider: ReservationProvider,
  opts?: { restaurantId?: string; restaurantName?: string }
) {
  const live = hasLiveReservationCredentials(provider);
  const label = reservationProviderLabel(provider);

  return prisma.reservationConnection.upsert({
    where: { locationId_provider: { locationId, provider } },
    create: {
      locationId,
      provider,
      connected: true,
      restaurantExternalId: opts?.restaurantId ?? (live ? undefined : `demo-${provider.toLowerCase()}`),
      restaurantName: opts?.restaurantName ?? `${label} — Demo`,
      autoSyncEnabled: true,
      lastSyncStatus: live ? "pending_oauth" : "demo",
      lastSyncMessage: live
        ? "API credentials detected — complete partner authorization in provider portal."
        : "Connected in demo mode. Sample reservations sync until live API keys are configured.",
    },
    update: {
      connected: true,
      restaurantExternalId: opts?.restaurantId ?? undefined,
      restaurantName: opts?.restaurantName ?? undefined,
      lastSyncStatus: live ? "pending_oauth" : "demo",
      lastSyncMessage: live ? "Reconnect initiated." : "Reconnected in demo mode.",
    },
  });
}

export async function disconnectReservationProvider(
  locationId: string,
  provider: ReservationProvider
) {
  return prisma.reservationConnection.update({
    where: { locationId_provider: { locationId, provider } },
    data: {
      connected: false,
      lastSyncStatus: "disconnected",
      lastSyncMessage: "Integration disconnected.",
    },
  });
}
