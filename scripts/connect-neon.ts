/**
 * Apply Prisma schema to Neon PostgreSQL.
 * Set DATABASE_URL in .env from Neon console → Connection string.
 *
 * Usage: npm run db:neon
 */
import { execSync } from "node:child_process";
import { loadEnvFile } from "./production-checklist-utils";

function main() {
  loadEnvFile();
  const url = process.env.DATABASE_URL?.trim() ?? "";

  if (!url.startsWith("postgresql://") && !url.startsWith("postgres://")) {
    console.error(
      "DATABASE_URL must be a Neon PostgreSQL connection string.\n\n" +
        "1. Open https://console.neon.tech → your project → Connect\n" +
        "2. Copy the connection string (Node.js / Prisma)\n" +
        "3. Paste into .env as DATABASE_URL=\"postgresql://...\"\n" +
        "4. Re-run: npm run db:neon"
    );
    process.exit(1);
  }

  console.log("[neon] Pushing schema to Neon...");
  execSync("npx prisma db push", { stdio: "inherit", env: process.env });
  execSync("npx prisma generate", { stdio: "inherit", env: process.env });
  console.log("[neon] Done — database ready.");
}

main();
