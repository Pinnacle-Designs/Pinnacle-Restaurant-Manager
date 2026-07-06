import { addDays } from "date-fns";
import { hashPassword } from "./auth";
import { prisma } from "./prisma";
import { validatePassword } from "./password-policy";
import { ensureDefaultStorageZones } from "./walk-in/storage-zones";
import { SUBSCRIPTION_CONTRACT_VERSION } from "./subscription-contracts";

const DEFAULT_EMAIL = "pro-clean@pinnacle.app";
const DEFAULT_PASSWORD = "PinnaclePro2026!";
const DEFAULT_NAME = "Pro Owner";
const DEFAULT_RESTAURANT = "Clean Pro Restaurant";

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
    return { created: false, email, locationId: existing.locationId };
  }

  if (existing && resetPassword) {
    await prisma.user.update({
      where: { id: existing.id },
      data: {
        passwordHash: hashPassword(password),
        active: true,
        emailVerifiedAt: existing.emailVerifiedAt ?? new Date(),
        mfaEnabled: false,
        role: "OWNER",
      },
    });
    if (existing.locationId) {
      await ensureBilling(existing.locationId, existing.id);
    }
    return { created: false, reset: true, email, locationId: existing.locationId };
  }

  const location = await prisma.location.create({
    data: {
      name: restaurantName,
      address: "Add your address",
      plan: "PRO",
      billingEmail: email,
    },
  });

  await ensureDefaultStorageZones(location.id);

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

export const PRO_CLEAN_DEFAULT_EMAIL = DEFAULT_EMAIL;
