/**
 * Production build for Vercel.
 * - PostgreSQL: schema push only (no demo data)
 * - SQLite preview: optional demo seed for marketing embeds
 */
import { execSync } from "child_process";
import path from "path";

function run(cmd: string) {
  execSync(cmd, { stdio: "inherit", env: process.env });
}

function main() {
  let dbUrl = process.env.DATABASE_URL?.trim() ?? "";

  if (!dbUrl) {
    const dbFile = path.join(process.cwd(), "prisma", "deploy.sqlite");
    dbUrl = `file:${dbFile}`;
    process.env.DATABASE_URL = dbUrl;
    console.log("[build] DATABASE_URL not set — using bundled SQLite at prisma/deploy.sqlite");
  }

  const isPostgres =
    dbUrl.startsWith("postgresql://") || dbUrl.startsWith("postgres://");
  const seedDemo =
    process.env.SEED_DEMO_DATA === "true" ||
    (!isPostgres &&
      process.env.SEED_DEMO_DATA !== "false" &&
      process.env.VERCEL === "1");

  run("npx prisma generate");

  if (isPostgres) {
    run("npx prisma db push --skip-generate");
    run("npx tsx scripts/seed-embed-demo.ts");
  } else if (seedDemo) {
    run("npm run db:deploy-seed");
  } else {
    console.log("[build] SQLite without SEED_DEMO_DATA — schema only");
    run("npx prisma db push --skip-generate");
  }

  run("node scripts/copy-tesseract-public.mjs");
  run("next build");
}

main();
