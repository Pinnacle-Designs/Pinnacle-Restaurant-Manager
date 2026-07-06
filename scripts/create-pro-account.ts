/**
 * Create a Pro owner account with no sample/seed data.
 *
 * Usage:
 *   npm run create:pro-account
 *   npm run create:pro-account -- --email you@example.com --password "YourPass123"
 *   npm run create:pro-account -- --name "Alex Owner" --restaurant "My Restaurant"
 */
import { addDays } from "date-fns";
import { loadEnvFile } from "./production-checklist-utils";
import { prisma } from "../src/lib/prisma";
import { hashPassword } from "../src/lib/auth";
import { validatePassword } from "../src/lib/password-policy";
import { ensureDefaultStorageZones } from "../src/lib/walk-in/storage-zones";
import { SUBSCRIPTION_CONTRACT_VERSION } from "../src/lib/subscription-contracts";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1 || i + 1 >= process.argv.length) return undefined;
  return process.argv[i + 1];
}

async function main() {
  loadEnvFile();

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

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.error(`Account already exists: ${email}`);
    console.error("Use a different --email or delete the existing user first.");
    process.exit(1);
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
    },
  });

  await prisma.location.update({
    where: { id: location.id },
    data: { subscriptionTermsAcceptedById: user.id },
  });

  await prisma.paymentProviderConnection.upsert({
    where: { locationId_purpose: { locationId: location.id, purpose: "SUBSCRIPTION" } },
    create: {
      locationId: location.id,
      provider: "STRIPE",
      purpose: "SUBSCRIPTION",
      status: "connected",
      accountId: `cus_pro_clean_${location.id.slice(0, 8)}`,
      metadata: JSON.stringify({ cleanAccount: true, plan: "PRO" }),
    },
    update: {
      status: "connected",
      metadata: JSON.stringify({ cleanAccount: true, plan: "PRO" }),
    },
  });

  console.log("\n✓ Pro account created (no seed data)\n");
  console.log(`  Email:      ${email}`);
  console.log(`  Password:   ${password}`);
  console.log(`  Plan:       PRO`);
  console.log(`  Restaurant: ${restaurantName}`);
  console.log(`  Location:   ${location.id}`);
  console.log("\n  Sign in at /login — workspace is empty and ready for real data.\n");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
