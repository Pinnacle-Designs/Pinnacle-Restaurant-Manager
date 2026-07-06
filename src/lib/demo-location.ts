import { prisma } from "./prisma";
import { DEMO_LOCATION_SAMPLE } from "./seed-data";
import {
  isDemoAccountEmail,
  isPlanDemoAccountEmail,
} from "./demo-email";
import { PLAN_DEMO_USERS } from "./demo-users";

export const SEEDED_DEMO_LOCATION_NAMES = [
  DEMO_LOCATION_SAMPLE,
  "Demo - Sample Data",
  "Demo — Sample Data",
] as const;

export async function findSeededDemoLocationId(): Promise<string | null> {
  const row = await prisma.location.findFirst({
    where: { name: { in: [...SEEDED_DEMO_LOCATION_NAMES] } },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  return row?.id ?? null;
}

/** Bind embed demo accounts to the Smoky Oak BBQ workspace (build-time seed). */
export async function resolveOwnerDemoLocationId(
  userId: string,
  currentLocationId: string | null | undefined
): Promise<string> {
  const seededId = await findSeededDemoLocationId();
  if (seededId) {
    if (currentLocationId !== seededId) {
      await prisma.user
        .update({
          where: { id: userId },
          data: { locationId: seededId },
        })
        .catch(() => {});
    }
    return seededId;
  }

  const { setupDemoWorkspace } = await import("./seed-data");
  const workspace = await setupDemoWorkspace("seeded");
  await prisma.user
    .update({
      where: { id: userId },
      data: { locationId: workspace.locationId },
    })
    .catch(() => {});
  return workspace.locationId;
}

export async function resolveDemoAccountLocationId(
  userId: string,
  email: string,
  currentLocationId: string | null | undefined
): Promise<string | null> {
  if (!isDemoAccountEmail(email)) return null;

  if (isPlanDemoAccountEmail(email)) {
    if (currentLocationId) {
      const exists = await prisma.location.findUnique({
        where: { id: currentLocationId },
        select: { id: true },
      });
      if (exists) return currentLocationId;
    }
    const planDemo = PLAN_DEMO_USERS.find(
      (u) => u.email.toLowerCase() === email.trim().toLowerCase()
    );
    if (planDemo) {
      const loc = await prisma.location.findFirst({
        where: { name: planDemo.locationName },
        select: { id: true },
      });
      return loc?.id ?? null;
    }
    return null;
  }

  return resolveOwnerDemoLocationId(userId, currentLocationId);
}

/** Idempotently ensure Smoky Oak has full demo data + Pro billing for embed/live demo. */
export async function ensureFullDemoWorkspace(
  locationId: string,
  ownerUserId: string
): Promise<void> {
  try {
    await ensureSeededDemoData(locationId);
  } catch (err) {
    console.error("[demo] ensureSeededDemoData failed (non-fatal):", err);
  }

  try {
    const { ensurePlanDemoWorkspaceReady } = await import("./demo-owner-billing");
    await ensurePlanDemoWorkspaceReady(locationId, ownerUserId, "PRO");
  } catch (err) {
    console.error("[demo] billing setup failed (non-fatal):", err);
  }

  const location = await prisma.location.findUnique({
    where: { id: locationId },
    select: { plan: true, setupComplete: true },
  });
  if (location?.plan !== "PRO" || !location.setupComplete) {
    try {
      const { seedDemoExtras } = await import("./seed-extras");
      await seedDemoExtras(locationId);
    } catch (err) {
      console.error("[demo] seedDemoExtras failed (non-fatal):", err);
    }
  }
}

/** Fill in sample data when the runtime DB is empty or thin (e.g. missed build seed). */
export async function ensureSeededDemoData(locationId: string): Promise<void> {
  const location = await prisma.location.findUnique({
    where: { id: locationId },
    select: { plan: true, setupComplete: true },
  });

  const [menuCount, orderCount, insightCount, staffCount, subscription] =
    await Promise.all([
      prisma.menuItem.count({ where: { locationId } }),
      prisma.order.count({ where: { locationId } }),
      prisma.businessInsight.count({ where: { locationId } }),
      prisma.staffMember.count({ where: { locationId } }),
      prisma.paymentProviderConnection.findUnique({
        where: { locationId_purpose: { locationId, purpose: "SUBSCRIPTION" } },
        select: { status: true },
      }),
    ]);

  const dataThin =
    menuCount < 5 ||
    orderCount < 20 ||
    insightCount < 3 ||
    staffCount < 3;
  const billingMissing = subscription?.status !== "connected";
  const profileIncomplete =
    location?.plan !== "PRO" || location?.setupComplete !== true;

  if (!dataThin && !billingMissing && !profileIncomplete) return;

  const { seedLocationData } = await import("./seed-data");
  await seedLocationData(locationId);

  if (billingMissing || profileIncomplete) {
    const { seedDemoExtras } = await import("./seed-extras");
    await seedDemoExtras(locationId);
  }
}
