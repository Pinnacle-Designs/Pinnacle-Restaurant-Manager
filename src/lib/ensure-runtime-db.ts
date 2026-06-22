import { copyFileSync, existsSync } from "fs";
import path from "path";
import { isSqliteDatabase } from "./env";

const TMP_DB = "/tmp/pinnacle.db";

/** True when running inside a Vercel serverless function (not during `vercel build`). */
function isVercelServerlessRuntime(): boolean {
  return process.env.VERCEL === "1" && Boolean(process.env.VERCEL_REGION);
}

/**
 * Legacy SQLite on Vercel: copy build-time DB to /tmp.
 * Skipped when DATABASE_URL points to PostgreSQL (Neon, Vercel Postgres, etc.).
 */
export function ensureRuntimeDatabase(): void {
  if (!isVercelServerlessRuntime()) return;
  if (!isSqliteDatabase()) return;

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
