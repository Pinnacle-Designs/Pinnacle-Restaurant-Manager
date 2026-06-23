/**
 * Production build for Vercel.
 * - PostgreSQL: schema push only (no demo data)
 * - SQLite preview: optional demo seed for marketing embeds
 */
import { execSync } from "child_process";

function run(cmd: string) {
  execSync(cmd, { stdio: "inherit", env: process.env });
}

function main() {
  const dbUrl = process.env.DATABASE_URL?.trim() ?? "";
  const isPostgres =
    dbUrl.startsWith("postgresql://") || dbUrl.startsWith("postgres://");
  const seedDemo = process.env.SEED_DEMO_DATA === "true";

  run("npx prisma generate");

  if (isPostgres) {
    run("npx prisma db push --skip-generate");
  } else if (seedDemo) {
    run("npm run db:deploy-seed");
  } else {
    console.log("[build] SQLite without SEED_DEMO_DATA — skipping demo seed");
    run("npx prisma db push --skip-generate");
  }

  run("next build");
}

main();
