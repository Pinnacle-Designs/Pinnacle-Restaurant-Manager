import { copyFileSync, existsSync } from "fs";
import path from "path";

const TMP_DB = "/tmp/pinnacle.db";

/** True when running inside a Vercel serverless function (not during `vercel build`). */
function isVercelServerlessRuntime(): boolean {
  return process.env.VERCEL === "1" && Boolean(process.env.VERCEL_REGION);
}

/**
 * Vercel lambdas have a read-only filesystem except /tmp.
 * Copy the build-time seeded SQLite file to /tmp before Prisma connects.
 */
export function ensureRuntimeDatabase(): void {
  if (!isVercelServerlessRuntime()) return;

  if (existsSync(TMP_DB)) {
    process.env.DATABASE_URL = `file:${TMP_DB}`;
    return;
  }

  const seedCandidates = [
    path.join(process.cwd(), "prisma", "deploy.sqlite"),
    path.join(process.cwd(), "prisma", "dev.db"),
  ];

  const seedPath = seedCandidates.find((candidate) => existsSync(candidate));
  if (!seedPath) {
    console.error(
      "[db] No bundled SQLite seed found. Run `npm run db:deploy-seed` before deploy."
    );
    process.env.DATABASE_URL = `file:${TMP_DB}`;
    return;
  }

  copyFileSync(seedPath, TMP_DB);
  process.env.DATABASE_URL = `file:${TMP_DB}`;
}
