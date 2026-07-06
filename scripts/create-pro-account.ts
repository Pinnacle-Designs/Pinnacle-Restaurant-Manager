/**
 * Create or reset a Pro owner account with no sample/seed data.
 *
 * Usage:
 *   npm run create:pro-account
 *   npm run create:pro-account -- --reset
 *   npm run create:pro-account -- --email you@example.com --password "YourPass123"
 *
 * Production (Vercel Postgres):
 *   DATABASE_URL="postgresql://..." npm run create:pro-account -- --reset
 */
import { addDays } from "date-fns";
import { loadEnvFile } from "./production-checklist-utils";
import { prisma } from "../src/lib/prisma";
import { hashPassword, verifyPassword } from "../src/lib/auth";
import { validatePassword } from "../src/lib/password-policy";
import { ensureDefaultStorageZones } from "../src/lib/walk-in/storage-zones";
import { SUBSCRIPTION_CONTRACT_VERSION } from "../src/lib/subscription-contracts";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1 || i + 1 >= process.argv.length) return undefined;
  return process.argv[i + 1];
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
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
    update: {
      status: "connected",
      metadata: JSON.stringify({ cleanAccount: true, plan: "PRO" }),
    },
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

async function main() {
  loadEnvFile();

  const reset = hasFlag("reset");
  const email = (arg("email") ?? "pro-clean@pinnacle.app").trim().toLowerCase();
  const password = arg("password") ?? "PinnaclePro2026!";
  const name = (arg("name") ?? "Pro Owner").trim().slice(0, 120);
  const restaurantName =
    (arg("restaurant") ?? "Clean Pro Restaurant").trim().slice(0, 120);

  const passwordError = validatePassword(password);
  if (passwordError) {
    console.error(`Invalid password: ${passwordError}`);
    process.exit(1);
  }

  const dbHint = process.env.DATABASE_URL?.startsWith("file:")
    ? "local SQLite"
    : process.env.DATABASE_URL?.includes("postgres")
      ? "PostgreSQL"
      : "database";

  const existing = await prisma.user.findUnique({
    where: { email },
    include: { location: true },
  });

  if (existing && !reset) {
    console.error(`Account already exists in ${dbHint}: ${email}`);
    console.error("Run with --reset to reset the password and fix account flags.");
    process.exit(1);
  }

  if (existing && reset) {
    const passwordHash = hashPassword(password);
    await prisma.user.update({
      where: { id: existing.id },
      data: {
        passwordHash,
        active: true,
        emailVerifiedAt: existing.emailVerifiedAt ?? new Date(),
        mfaEnabled: false,
        role: "OWNER",
        locationId: existing.locationId,
      },
    });

    if (existing.locationId) {
      await ensureBilling(existing.locationId, existing.id);
    } else {
      const location = await prisma.location.create({
        data: {
          name: restaurantName,
          address: "Add your address",
          plan: "PRO",
          billingEmail: email,
        },
      });
      await ensureDefaultStorageZones(location.id);
      await prisma.user.update({
        where: { id: existing.id },
        data: { locationId: location.id },
      });
      await ensureBilling(location.id, existing.id);
    }

    const ok = verifyPassword(password, passwordHash);
    console.log(`\n✓ Account reset in ${dbHint} (${ok ? "password verified" : "password mismatch — retry"})\n`);
    console.log(`  Email:      ${email}`);
    console.log(`  Plan:       PRO`);
    console.log(`  Restaurant: ${existing.location?.name ?? restaurantName}`);
    return;
  }

  const location = await prisma.location.create({
    data: {
      name: restaurantName,
      address: "Add your address",
      plan: "PRO",
      billingEmail: email,
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

  console.log(`\n✓ Pro account created in ${dbHint} (no seed data)\n`);
  console.log(`  Email:      ${email}`);
  console.log(`  Password:   ${password}`);
  console.log(`  Plan:       PRO`);
  console.log(`  Restaurant: ${restaurantName}`);
  console.log(`  Location:   ${location.id}`);
  console.log("\n  Sign in at /login on the same environment as this database.\n");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
