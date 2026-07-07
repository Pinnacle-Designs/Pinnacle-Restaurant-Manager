/**
 * Build-time: create prisma/deploy.sqlite with demo users + seeded workspace.
 * Used by Vercel (`vercel-build`) so serverless functions can copy it to /tmp.
 */
import { execSync } from "child_process";
import { existsSync, unlinkSync } from "fs";
import path from "path";

async function main() {
  const dbFile = path.join(process.cwd(), "prisma", "deploy.sqlite");
  const dbUrl = `file:${dbFile}`;

  // Always start fresh — avoids non-interactive `db push` failures when the
  // committed deploy.sqlite schema is behind prisma/schema.prisma (e.g. new columns).
  for (const file of [dbFile, `${dbFile}-journal`, `${dbFile}-wal`, `${dbFile}-shm`]) {
    if (existsSync(file)) unlinkSync(file);
  }

  process.env.DATABASE_URL = dbUrl;

  try {
    execSync("npx prisma db push --skip-generate --accept-data-loss", {
      stdio: "inherit",
      env: { ...process.env, DATABASE_URL: dbUrl },
    });
  } catch (err) {
    console.error("[db] prisma db push failed. DATABASE_URL=", dbUrl);
    throw err;
  }

  const { seedDemoUsers, seedPlanDemoWorkspaces } = await import("../src/lib/demo-users");
  const { setupDemoWorkspace } = await import("../src/lib/seed-data");
  const { ensurePlanDemoWorkspaceReady } = await import("../src/lib/demo-owner-billing");

  await seedDemoUsers();
  const workspace = await setupDemoWorkspace("seeded");

  const { prisma } = await import("../src/lib/prisma");
  const owner = await prisma.user.update({
    where: { email: "owner@pinnacle.com" },
    data: { locationId: workspace.locationId },
  });

  await ensurePlanDemoWorkspaceReady(workspace.locationId, owner.id, "PRO");

  await seedPlanDemoWorkspaces();

  const { ensureProCleanAccount } = await import("../src/lib/pro-clean-account");
  const proClean = await ensureProCleanAccount({ resetPassword: true });
  console.log(`[db] Pro clean account: ${proClean.email} (created=${proClean.created})`);

  if (proClean.locationId) {
    const [proMenu, proOrders, proStaff] = await Promise.all([
      prisma.menuItem.count({ where: { locationId: proClean.locationId } }),
      prisma.order.count({ where: { locationId: proClean.locationId } }),
      prisma.staffMember.count({ where: { locationId: proClean.locationId } }),
    ]);
    if (proMenu > 0 || proOrders > 0 || proStaff > 0) {
      throw new Error(
        `[db] pro-clean workspace must be empty (menu=${proMenu}, orders=${proOrders}, staff=${proStaff})`
      );
    }
    const proLoc = await prisma.location.findUnique({
      where: { id: proClean.locationId },
      select: { name: true },
    });
    console.log(`[db] Pro clean workspace: ${proLoc?.name} (empty)`);
  }

  const [userCount, menuCount, orderCount, location] = await Promise.all([
    prisma.user.count(),
    prisma.menuItem.count({ where: { locationId: workspace.locationId } }),
    prisma.order.count({ where: { locationId: workspace.locationId } }),
    prisma.location.findUnique({
      where: { id: workspace.locationId },
      select: { name: true, plan: true, setupComplete: true },
    }),
  ]);

  console.log(
    `[db] Smoky Oak BBQ: ${location?.name} (${location?.plan}, setup=${location?.setupComplete})`
  );
  console.log(`[db] Menu items: ${menuCount}, orders: ${orderCount}, users: ${userCount}`);

  await prisma.$disconnect();

  console.log(`[db] Seeded deploy database at ${dbFile}`);
}

main().catch((err) => {
  console.error("[db] Deploy seed failed:", err);
  process.exit(1);
});
