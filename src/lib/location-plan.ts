import { getSessionUser } from "./auth";
import { prisma } from "./prisma";
import type { PlanId } from "./plans";
import type { SessionUser } from "./session";
import { resolveEffectivePermissions } from "./permission-resolve";

export async function getLocationPlan(locationId: string | null | undefined): Promise<PlanId> {
  if (!locationId) return "STARTER";
  const location = await prisma.location.findUnique({
    where: { id: locationId },
    select: { plan: true },
  });
  return location?.plan ?? "STARTER";
}

export async function enrichUserWithPlan(user: SessionUser): Promise<SessionUser> {
  let plan: PlanId = user.plan ?? "STARTER";
  let name = user.name;
  let avatarUrl: string | null | undefined;

  try {
    const [resolvedPlan, dbUser] = await Promise.all([
      getLocationPlan(user.locationId),
      prisma.user.findUnique({
        where: { id: user.id },
        select: { avatarUrl: true, name: true },
      }),
    ]);
    plan = resolvedPlan;
    name = dbUser?.name ?? user.name;
    avatarUrl = dbUser?.avatarUrl ?? undefined;
  } catch {
    try {
      plan = await getLocationPlan(user.locationId);
    } catch {
      plan = user.plan ?? "STARTER";
    }
    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { name: true },
    });
    name = dbUser?.name ?? user.name;
  }

  return {
    ...user,
    name,
    plan,
    avatarUrl,
    permissions: await resolveEffectivePermissions(user.role, user.locationId, user.id),
  };
}

export async function getEnrichedSessionUser(): Promise<SessionUser | null> {
  const user = await getSessionUser();
  if (!user) return null;
  return enrichUserWithPlan(user);
}
