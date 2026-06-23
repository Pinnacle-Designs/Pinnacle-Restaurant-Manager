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

  await seedDemoUsers();
  const workspace = await setupDemoWorkspace("seeded");

  const { prisma } = await import("../src/lib/prisma");
  await prisma.user.update({
    where: { email: "owner@pinnacle.com" },
    data: { locationId: workspace.locationId },
  });

  await seedPlanDemoWorkspaces();

  const userCount = await prisma.user.count();
  const planDemoCount = await prisma.user.count({
    where: {
      email: {
        in: [
          "demo-starter@pinnacle.com",
          "demo-growth@pinnacle.com",
          "demo-pro@pinnacle.com",
        ],
      },
    },
  });
  console.log(`[db] Users: ${userCount} total, ${planDemoCount} plan-tier demos`);

  await prisma.$disconnect();

  console.log(`[db] Seeded deploy database at ${dbFile}`);
}

main().catch((err) => {
  console.error("[db] Deploy seed failed:", err);
  process.exit(1);
});
