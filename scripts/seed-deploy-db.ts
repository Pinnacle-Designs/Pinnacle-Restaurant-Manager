/**
 * Build-time: create prisma/deploy.sqlite with demo users + seeded workspace.
 * Used by Vercel (`vercel-build`) so serverless functions can copy it to /tmp.
 */
import { execSync } from "child_process";
import path from "path";

async function main() {
  const dbFile = path.join(process.cwd(), "prisma", "deploy.sqlite");
  process.env.DATABASE_URL = `file:${dbFile}`;

  execSync("npx prisma db push --skip-generate", {
    stdio: "inherit",
    env: process.env,
  });

  const { seedDemoUsers } = await import("../src/lib/demo-users");
  const { setupDemoWorkspace } = await import("../src/lib/seed-data");

  await seedDemoUsers();
  await setupDemoWorkspace("seeded");

  const { prisma } = await import("../src/lib/prisma");
  await prisma.$disconnect();

  console.log(`[db] Seeded deploy database at ${dbFile}`);
}

main().catch((err) => {
  console.error("[db] Deploy seed failed:", err);
  process.exit(1);
});
