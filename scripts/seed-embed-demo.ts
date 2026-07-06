/**
 * Idempotent marketing embed demo — Smoky Oak BBQ + owner@pinnacle.com.
 * Run on Vercel Postgres builds so /api/embed/launch stays fast.
 */
import { loadEnvFile } from "./production-checklist-utils";

async function main() {
  loadEnvFile();

  const { seedDemoUsers } = await import("../src/lib/demo-users");
  const { getOrCreateDemoLocation } = await import("../src/lib/seed-data");
  const { ensureSeededDemoData } = await import("../src/lib/demo-location");
  const { ensurePlanDemoWorkspaceReady } = await import("../src/lib/demo-owner-billing");
  const { prisma } = await import("../src/lib/prisma");

  await seedDemoUsers();
  const location = await getOrCreateDemoLocation("seeded");

  const owner = await prisma.user.findUnique({
    where: { email: "owner@pinnacle.com" },
    select: { id: true, locationId: true },
  });
  if (!owner) {
    throw new Error("owner@pinnacle.com missing after seedDemoUsers");
  }

  if (owner.locationId !== location.id) {
    await prisma.user.update({
      where: { id: owner.id },
      data: { locationId: location.id },
    });
  }

  await ensureSeededDemoData(location.id);
  await ensurePlanDemoWorkspaceReady(location.id, owner.id, "PRO");

  const [menuCount, orderCount] = await Promise.all([
    prisma.menuItem.count({ where: { locationId: location.id } }),
    prisma.order.count({ where: { locationId: location.id } }),
  ]);

  console.log(
    `[embed-demo] ${location.name} (${location.id}) — menu: ${menuCount}, orders: ${orderCount}`
  );

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("[embed-demo] Failed:", err);
  process.exit(1);
});
