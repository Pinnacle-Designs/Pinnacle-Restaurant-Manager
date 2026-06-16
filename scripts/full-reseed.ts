/**
 * Wipe dev SQLite and run the complete demo seed (users, plan demos, Smoky Oak BBQ).
 */
import { execSync } from "child_process";
import { seedDemoUsers, seedPlanDemoUsers } from "../src/lib/demo-users";
import { setupDemoWorkspace } from "../src/lib/seed-data";
import { prisma } from "../src/lib/prisma";

async function main() {
  console.log("[reseed] Resetting database schema...");
  execSync("npx prisma db push --force-reset --accept-data-loss --skip-generate", {
    stdio: "inherit",
  });

  console.log("[reseed] Seeding demo users and platform data...");
  await seedDemoUsers();

  console.log("[reseed] Seeding Smoky Oak BBQ workspace...");
  const workspace = await setupDemoWorkspace("seeded");

  console.log("[reseed] Seeding plan-tier demo accounts...");
  await seedPlanDemoUsers();

  await prisma.user.update({
    where: { email: "owner@pinnacle.com" },
    data: { locationId: workspace.locationId },
  });

  const loc = workspace.locationId;
  const summary = {
    location: workspace.locationName,
    locationId: loc,
    menuItems: await prisma.menuItem.count({ where: { locationId: loc } }),
    inventory: await prisma.inventoryItem.count({ where: { locationId: loc } }),
    orders: await prisma.order.count({ where: { locationId: loc } }),
    draftPos: await prisma.vendorPurchaseOrder.count({
      where: { locationId: loc, status: "DRAFT" },
    }),
    scorecardReceipts: await prisma.goodsReceipt.count({
      where: { locationId: loc, notes: "scorecard-demo" },
    }),
    ocrInvoices: await prisma.vendorInvoice.count({
      where: { locationId: loc, imageUrl: { not: null } },
    }),
    vendorCredits: await prisma.vendorCredit.count({ where: { locationId: loc } }),
    ediConnections: await prisma.vendorEdiConnection.count({ where: { locationId: loc } }),
    pitchInquiries: await prisma.activityLog.count({ where: { entity: "pitch_deck" } }),
    users: await prisma.user.count(),
    platformAdmin: await prisma.user.count({
      where: { email: "owner@pinnacle.com", isPlatformAdmin: true },
    }),
  };

  console.log("[reseed] Done:", JSON.stringify(summary, null, 2));
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("[reseed] Failed:", err);
  process.exit(1);
});
