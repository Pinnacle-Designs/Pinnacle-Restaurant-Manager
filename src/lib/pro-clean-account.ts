import { addDays } from "date-fns";
import { hashPassword } from "./auth";
import { prisma } from "./prisma";
import { validatePassword } from "./password-policy";
import { ensureDefaultStorageZones } from "./walk-in/storage-zones";
import { SUBSCRIPTION_CONTRACT_VERSION } from "./subscription-contracts";
import { SEEDED_DEMO_LOCATION_NAMES, findSeededDemoLocationId } from "./demo-location";
import { PRO_CLEAN_DEFAULT_EMAIL, isProCleanAccountEmail } from "./pro-clean-email";

const DEFAULT_EMAIL = PRO_CLEAN_DEFAULT_EMAIL;
const DEFAULT_PASSWORD = "PinnaclePro2026!";
const DEFAULT_NAME = "Pro Owner";
const DEFAULT_RESTAURANT = "Clean Pro Restaurant";
const PLAN_DEMO_PREFIX = "Plan Demo -";

export { isProCleanAccountEmail };

/** Fresh DB location for pro-clean — never trust session/cookies alone. */
export async function resolveProCleanLocationId(
  user: { id: string; email: string } | null | undefined
): Promise<string | null> {
  if (!user || !isProCleanAccountEmail(user.email)) return null;

  const row = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      locationId: true,
      location: { select: { id: true, active: true, name: true } },
    },
  });

  if (
    row?.locationId &&
    row.location?.active &&
    !(await locationNeedsCleanWorkspace(row.locationId, DEFAULT_RESTAURANT))
  ) {
    return row.locationId;
  }

  const ensured = await ensureProCleanAccount({ resetPassword: false });
  return ensured.locationId ?? null;
}

/** @deprecated Use resolveProCleanLocationId — validates workspace, not just cookie/session. */
export async function getProCleanLocationIdForUser(
  user: { id: string; email: string } | null | undefined
): Promise<string | null> {
  return resolveProCleanLocationId(user);
}

/** True when the location is a demo workspace or already has seeded restaurant data. */
async function locationNeedsCleanWorkspace(
  locationId: string,
  expectedName: string
): Promise<boolean> {
  const demoLocationId = await findSeededDemoLocationId();
  if (demoLocationId && locationId === demoLocationId) return true;

  const location = await prisma.location.findUnique({
    where: { id: locationId },
    select: { name: true },
  });
  if (!location) return true;

  if ((SEEDED_DEMO_LOCATION_NAMES as readonly string[]).includes(location.name)) {
    return true;
  }
  if (location.name.startsWith(PLAN_DEMO_PREFIX)) return true;

  const [menuCount, orderCount, staffCount] = await Promise.all([
    prisma.menuItem.count({ where: { locationId } }),
    prisma.order.count({ where: { locationId } }),
    prisma.staffMember.count({ where: { locationId } }),
  ]);

  if (location.name !== expectedName) {
    return menuCount > 0 || orderCount > 0 || staffCount > 0;
  }

  return menuCount > 0 || orderCount > 0 || staffCount > 0;
}

async function createCleanProLocation(email: string, restaurantName: string) {
  const location = await prisma.location.create({
    data: {
      name: restaurantName,
      address: "Add your address",
      plan: "PRO",
      billingEmail: email,
    },
  });
  await ensureDefaultStorageZones(location.id);
  return location;
}

async function ensureBilling(locationId: string, userId: string) {
  await prisma.paymentProviderConnection.upsert({
    where: { locationId_purpose: { locationId, purpose: "SUBSCRIPTION" } },
    create: {
      locationId,
      provider: "STRIPE",
      purpose: "SUBSCRIPTION",
      status: "connected",
      accountId: `cus_pro_clean_${locationId.slice(0, 8)}`,
      metadata: JSON.stringify({ cleanAccount: true, plan: "PRO" }),
    },
    update: { status: "connected" },
  });

  await prisma.location.update({
    where: { id: locationId },
    data: {
      plan: "PRO",
      setupComplete: true,
      onboardingStep: 4,
      autopayEnabled: true,
      paymentBrand: "Visa",
      paymentLast4: "4242",
      paymentExpMonth: 12,
      paymentExpYear: 2028,
      nextBillingDate: addDays(new Date(), 30),
      subscriptionTermsAcceptedAt: new Date(),
      subscriptionTermsVersion: SUBSCRIPTION_CONTRACT_VERSION,
      subscriptionTermsPlan: "PRO",
      subscriptionTermsAcceptedById: userId,
      active: true,
    },
  });
}

/** Ensure pro-clean@pinnacle.app exists on the current database (idempotent). */
export async function ensureProCleanAccount(options?: {
  email?: string;
  password?: string;
  name?: string;
  restaurantName?: string;
  resetPassword?: boolean;
}) {
  const email = (options?.email ?? process.env.PRO_CLEAN_EMAIL ?? DEFAULT_EMAIL)
    .trim()
    .toLowerCase();
  const password =
    options?.password ?? process.env.PRO_CLEAN_PASSWORD ?? DEFAULT_PASSWORD;
  const name = (options?.name ?? DEFAULT_NAME).trim().slice(0, 120);
  const restaurantName = (options?.restaurantName ?? DEFAULT_RESTAURANT).trim().slice(0, 120);
  const resetPassword = options?.resetPassword ?? process.env.PRO_CLEAN_RESET === "true";

  const passwordError = validatePassword(password);
  if (passwordError) throw new Error(passwordError);

  const existing = await prisma.user.findUnique({
    where: { email },
    include: { location: true },
  });

  if (existing && !resetPassword) {
    let locationId = existing.locationId;
    if (
      !locationId ||
      (await locationNeedsCleanWorkspace(locationId, restaurantName))
    ) {
      const location = await createCleanProLocation(email, restaurantName);
      locationId = location.id;
      await prisma.user.update({
        where: { id: existing.id },
        data: { locationId, role: "OWNER", active: true },
      });
      await ensureBilling(locationId, existing.id);
      return {
        created: false,
        relocated: true,
        email,
        locationId,
      };
    }
    return { created: false, email, locationId: existing.locationId };
  }

  if (existing && resetPassword) {
    let locationId = existing.locationId;

    if (
      !locationId ||
      (await locationNeedsCleanWorkspace(locationId, restaurantName))
    ) {
      const location = await createCleanProLocation(email, restaurantName);
      locationId = location.id;
    } else {
      await prisma.location.update({
        where: { id: locationId },
        data: { name: restaurantName, plan: "PRO", billingEmail: email },
      });
    }

    await prisma.user.update({
      where: { id: existing.id },
      data: {
        passwordHash: hashPassword(password),
        active: true,
        emailVerifiedAt: existing.emailVerifiedAt ?? new Date(),
        mfaEnabled: false,
        role: "OWNER",
        locationId,
      },
    });

    await ensureBilling(locationId, existing.id);
    return { created: false, reset: true, relocated: locationId !== existing.locationId, email, locationId };
  }

  const location = await createCleanProLocation(email, restaurantName);

  const user = await prisma.user.create({
    data: {
      email,
      name,
      passwordHash: hashPassword(password),
      role: "OWNER",
      locationId: location.id,
      active: true,
      emailVerifiedAt: new Date(),
      mfaEnabled: false,
    },
  });

  await ensureBilling(location.id, user.id);

  return { created: true, email, locationId: location.id };
}

export { PRO_CLEAN_DEFAULT_EMAIL };
