import { copyFileSync, existsSync, statSync } from "fs";
import path from "path";
import { isSqliteDatabase } from "./env";

function runtimeDbPath(): string {
  const deploymentId = process.env.VERCEL_DEPLOYMENT_ID ?? "local";
  return `/tmp/pinnacle-${deploymentId}.db`;
}

/** True when running inside a Vercel serverless function (not during `vercel build`). */
function isVercelServerlessRuntime(): boolean {
  return process.env.VERCEL === "1" && Boolean(process.env.VERCEL_REGION);
}

function bundledSeedPath(): string | null {
  const seedCandidates = [
    path.join(process.cwd(), "prisma", "deploy.sqlite"),
    path.join(process.cwd(), "prisma", "dev.db"),
  ];
  return seedCandidates.find((candidate) => existsSync(candidate)) ?? null;
}

/**
 * Legacy SQLite on Vercel: copy build-time DB to /tmp per deployment.
 * Skipped when DATABASE_URL points to PostgreSQL (Neon, Vercel Postgres, etc.).
 */
export function ensureRuntimeDatabase(): void {
  if (!isVercelServerlessRuntime()) return;
  if (!isSqliteDatabase()) return;

  const tmpDb = runtimeDbPath();
  const seedPath = bundledSeedPath();

  if (!seedPath) {
    console.error(
      "[db] No bundled SQLite seed found. Run `npm run db:deploy-seed` before deploy."
    );
    process.env.DATABASE_URL = `file:${tmpDb}`;
    return;
  }

  const shouldCopy =
    !existsSync(tmpDb) ||
    statSync(seedPath).mtimeMs > statSync(tmpDb).mtimeMs ||
    statSync(seedPath).size !== statSync(tmpDb).size;

  if (shouldCopy) {
    copyFileSync(seedPath, tmpDb);
    console.log(`[db] Copied bundled seed ${seedPath} → ${tmpDb}`);
  }

  process.env.DATABASE_URL = `file:${tmpDb}`;
}
