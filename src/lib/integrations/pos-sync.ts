import { prisma } from "@/lib/prisma";
import { startOfDay } from "date-fns";

export async function ensureIntegrationSettings(locationId: string) {
  return prisma.integrationSettings.upsert({
    where: { locationId },
    create: { locationId, posSyncEnabled: true },
    update: {},
  });
}

/** Log real-time inventory depletion when a ticket is fired to the kitchen. */
export async function recordPosSyncDepletion(
  locationId: string,
  menuItemId: string,
  platesSold: number,
  ingredientCount: number
) {
  if (platesSold <= 0 || ingredientCount <= 0) return;

  const settings = await ensureIntegrationSettings(locationId);
  if (!settings.posSyncEnabled) return;

  const today = startOfDay(new Date());
  const resetCount = settings.lastPosSyncAt && settings.lastPosSyncAt < today;

  await prisma.integrationSettings.update({
    where: { locationId },
    data: {
      lastPosSyncAt: new Date(),
      posDepletionsToday: resetCount ? 1 : { increment: 1 },
    },
  });

  const menuItem = await prisma.menuItem.findUnique({
    where: { id: menuItemId },
    select: { name: true },
  });

  await prisma.activityLog.create({
    data: {
      locationId,
      action: "POS_SYNC",
      entity: "inventory",
      entityId: menuItemId,
      details: `Fired ${platesSold}× ${menuItem?.name ?? "item"} — ${ingredientCount} ingredients deducted`,
    },
  });
}
