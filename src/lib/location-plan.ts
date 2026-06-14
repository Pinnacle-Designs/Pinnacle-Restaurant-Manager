import { getSessionUser } from "./auth";
import { prisma } from "./prisma";
import type { PlanId } from "./plans";
import type { SessionUser } from "./session";
import { resolveEffectivePermissions } from "./permission-resolve";
import { isPlatformAdmin } from "./platform-admin";

export async function getLocationPlan(locationId: string | null | undefined): Promise<PlanId> {
  if (!locationId) return "STARTER";
  const location = await prisma.location.findUnique({
    where: { id: locationId },
    select: { plan: true },
  });
  return location?.plan ?? "STARTER";
}

export async function getLocationSetupComplete(
  locationId: string | null | undefined
): Promise<boolean> {
  if (!locationId) return true;
  const location = await prisma.location.findUnique({
    where: { id: locationId },
    select: { setupComplete: true },
  });
  return location?.setupComplete ?? true;
}

export async function enrichUserWithPlan(user: SessionUser): Promise<SessionUser> {
  let plan: PlanId = user.plan ?? "STARTER";
  let name = user.name;
  let avatarUrl: string | null | undefined;
  let setupComplete = user.setupComplete ?? true;
  let isAdmin = user.isPlatformAdmin ?? false;

  try {
    const [resolvedPlan, dbUser, resolvedSetup] = await Promise.all([
      getLocationPlan(user.locationId),
      prisma.user.findUnique({
        where: { id: user.id },
        select: { avatarUrl: true, name: true, isPlatformAdmin: true },
      }),
      getLocationSetupComplete(user.locationId),
    ]);
    plan = resolvedPlan;
    name = dbUser?.name ?? user.name;
    avatarUrl = dbUser?.avatarUrl ?? undefined;
    setupComplete = resolvedSetup;
    isAdmin = isPlatformAdmin({
      email: user.email,
      isPlatformAdmin: dbUser?.isPlatformAdmin ?? false,
    });
  } catch {
    try {
      plan = await getLocationPlan(user.locationId);
      setupComplete = await getLocationSetupComplete(user.locationId);
    } catch {
      plan = user.plan ?? "STARTER";
    }
    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { name: true, isPlatformAdmin: true },
    });
    name = dbUser?.name ?? user.name;
    isAdmin = isPlatformAdmin({
      email: user.email,
      isPlatformAdmin: dbUser?.isPlatformAdmin ?? false,
    });
  }

  return {
    ...user,
    name,
    plan,
    avatarUrl,
    setupComplete,
    isPlatformAdmin: isAdmin,
    permissions: await resolveEffectivePermissions(user.role, user.locationId, user.id),
  };
}

export async function getEnrichedSessionUser(): Promise<SessionUser | null> {
  const user = await getSessionUser();
  if (!user) return null;
  return enrichUserWithPlan(user);
}
