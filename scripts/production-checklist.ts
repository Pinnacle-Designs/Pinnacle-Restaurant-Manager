/**
 * Production deployment checklist — generates secrets, validates env, prepares DB.
 *
 * Usage:
 *   npm run production:checklist
 *   npm run production:checklist -- --write-env
 *   npm run production:checklist -- --postgres   # use docker postgres URL
 */
import { randomBytes } from "node:crypto";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const APP_URL = "https://www.pinnaclerestaurantmanager.com";
const POSTGRES_URL =
  "postgresql://pinnacle:pinnacle@localhost:5432/pinnacle?schema=public";
const ENV_PATH = path.join(process.cwd(), ".env");
const VERCEL_ENV_PATH = path.join(process.cwd(), ".env.vercel.production");

function loadEnvFile(filePath: string): Record<string, string> {
  const env: Record<string, string> = {};
  if (!fs.existsSync(filePath)) return env;
  let text = fs.readFileSync(filePath, "utf8");
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
    if (!process.env[key]) process.env[key] = value;
  }
  return env;
}

function secret(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

function upsertEnvValue(lines: string[], key: string, value: string): string[] {
  const pattern = new RegExp(`^${key}=`);
  const next = `"${value.replace(/"/g, "")}"`;
  let found = false;
  const updated = lines.map((line) => {
    if (pattern.test(line.trim())) {
      found = true;
      return `${key}=${next}`;
    }
    return line;
  });
  if (!found) updated.push(`${key}=${next}`);
  return updated;
}

function writeEnvFile(updates: Record<string, string>) {
  const existing = fs.existsSync(ENV_PATH)
    ? fs.readFileSync(ENV_PATH, "utf8").split(/\r?\n/)
    : [];
  let lines = existing;
  for (const [key, value] of Object.entries(updates)) {
    lines = upsertEnvValue(lines, key, value);
  }
  fs.writeFileSync(ENV_PATH, `${lines.join("\n").trimEnd()}\n`, "utf8");
  console.log(`[env] Updated ${ENV_PATH}`);
}

function writeVercelEnvTemplate(env: Record<string, string>) {
  const required: Array<{ key: string; note?: string }> = [
    { key: "AUTH_SECRET" },
    { key: "NEXT_PUBLIC_APP_URL" },
    { key: "DATABASE_URL", note: "PostgreSQL connection string (Neon / Vercel Postgres / Supabase)" },
    { key: "STRIPE_SECRET_KEY", note: "sk_live_..." },
    { key: "STRIPE_WEBHOOK_SECRET", note: "whsec_..." },
    { key: "STRIPE_PRICE_STARTER" },
    { key: "STRIPE_PRICE_GROWTH" },
    { key: "STRIPE_PRICE_PRO" },
    { key: "INTEGRATION_WEBHOOK_SECRET" },
    { key: "UPSTASH_REDIS_REST_URL", note: "Optional — rate limiting in production" },
    { key: "UPSTASH_REDIS_REST_TOKEN", note: "Optional — rate limiting in production" },
    { key: "OPENAI_API_KEY", note: "Optional — enhanced AI vision and insights" },
    { key: "PLAN_BILLING_OPTIONAL", note: "false" },
    { key: "PLAN_TRIAL_DAYS", note: "14" },
    { key: "SUPPORT_EMAIL", note: "support@yourdomain.com" },
    { key: "EMBED_FRAME_ANCESTORS", note: "https://pinnacle-designs.github.io" },
  ];

  const lines = [
    "# Copy these into Vercel → Project → Settings → Environment Variables (Production)",
    `# Generated ${new Date().toISOString()}`,
    "",
  ];

  for (const { key, note } of required) {
    let value = env[key] || process.env[key] || "";
    if (key === "DATABASE_URL" && (value.startsWith("file:") || !value)) {
      lines.push(`# DATABASE_URL=  ${note ?? "(required)"}`);
      continue;
    }
    if (value) {
      lines.push(`${key}=${value}`);
    } else {
      lines.push(`# ${key}=  ${note ? `(${note})` : "(required)"}`);
    }
  }

  fs.writeFileSync(VERCEL_ENV_PATH, `${lines.join("\n")}\n`, "utf8");
  console.log(`[env] Wrote Vercel template → ${VERCEL_ENV_PATH}`);
}

function run(cmd: string) {
  execSync(cmd, { stdio: "inherit", env: process.env, cwd: process.cwd() });
}

function dockerAvailable(): boolean {
  try {
    execSync("docker info", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const shouldWriteEnv = process.argv.includes("--write-env") || process.argv.includes("--write");
  const usePostgres = process.argv.includes("--postgres");
  const env = loadEnvFile(ENV_PATH);

  const generated = {
    AUTH_SECRET:
      env.AUTH_SECRET && env.AUTH_SECRET.length >= 32 && !env.AUTH_SECRET.includes("change-this")
        ? env.AUTH_SECRET
        : secret(32),
    INTEGRATION_WEBHOOK_SECRET: env.INTEGRATION_WEBHOOK_SECRET || secret(24),
    NEXT_PUBLIC_APP_URL: env.NEXT_PUBLIC_APP_URL || APP_URL,
    PLAN_BILLING_OPTIONAL: env.PLAN_BILLING_OPTIONAL || "false",
    PLAN_TRIAL_DAYS: env.PLAN_TRIAL_DAYS || "14",
    SUPPORT_EMAIL: env.SUPPORT_EMAIL || "support@pinnacle.app",
  };

  if (usePostgres) {
    if (!dockerAvailable()) {
      console.error(
        "[postgres] Docker is not running. Install Docker Desktop, then run:\n" +
          "  docker compose up -d\n" +
          "  npm run production:checklist -- --write-env --postgres"
      );
      process.exit(1);
    }
    console.log("[postgres] Starting Docker Postgres...");
    run("docker compose up -d");
    Object.assign(generated, { DATABASE_URL: POSTGRES_URL });
  }

  if (shouldWriteEnv) {
    writeEnvFile(generated);
    loadEnvFile(ENV_PATH);
  } else {
    Object.assign(process.env, generated);
    console.log("[env] Dry run — pass --write-env to save secrets to .env");
  }

  writeVercelEnvTemplate({ ...env, ...generated });

  console.log("\n[1/5] Database");
  const dbUrl = process.env.DATABASE_URL ?? "";
  if (dbUrl.startsWith("postgresql://") || dbUrl.startsWith("postgres://")) {
    run("npx prisma db push --skip-generate");
  } else {
    console.log(
      "  SQLite in use for local dev. For production, set PostgreSQL DATABASE_URL on Vercel.\n" +
        "  Local Postgres: docker compose up -d && npm run production:checklist -- --write-env --postgres"
    );
    run("npx prisma db push --skip-generate");
  }

  console.log("\n[2/5] Prisma client");
  run("npx prisma generate");

  console.log("\n[3/5] Stripe");
  if (process.env.STRIPE_SECRET_KEY?.trim()) {
    try {
      run("npm run stripe:setup -- --write-env");
    } catch {
      console.warn("  Stripe setup failed — add STRIPE_SECRET_KEY and re-run.");
    }
  } else {
    console.log(
      "  STRIPE_SECRET_KEY not set. Add sk_test_... or sk_live_... to .env, then:\n" +
        "    npm run stripe:setup -- --write-env\n" +
        "  Live production:\n" +
        `    APP_URL=${APP_URL} npm run stripe:setup:live`
    );
  }

  console.log("\n[4/5] Production env validation (simulated)");
  const processEnv = process.env as Record<string, string | undefined>;
  const prevNodeEnv = processEnv.NODE_ENV;
  processEnv.NODE_ENV = "production";
  if (dbUrl.startsWith("file:")) {
    processEnv.ALLOW_SQLITE_PRODUCTION = "true";
    console.log("  Note: ALLOW_SQLITE_PRODUCTION=true only for preview — use Postgres for real customers.");
  }
  try {
    const { validateProductionEnv } = await import("../src/lib/env");
    validateProductionEnv();
    console.log("  ✓ Production env validation passed");
  } catch (err) {
    console.warn(`  ⚠ ${err instanceof Error ? err.message : err}`);
  } finally {
    if (prevNodeEnv !== undefined) processEnv.NODE_ENV = prevNodeEnv;
    else delete processEnv.NODE_ENV;
    delete processEnv.ALLOW_SQLITE_PRODUCTION;
  }

  console.log("\n[5/5] Manual steps remaining");
  console.log(`
  □ Create PostgreSQL on Vercel/Neon/Supabase → set DATABASE_URL in Vercel
  □ Copy variables from .env.vercel.production into Vercel project settings
  □ Run live Stripe setup:
      APP_URL=${APP_URL} npm run stripe:setup:live
  □ Deploy:
      npx vercel --prod
    Or connect GitHub repo in Vercel dashboard (auto-deploy on push)
  □ Test: sign up at ${APP_URL}/signup?plan=GROWTH → Stripe checkout → dashboard
  □ Verify health: GET ${APP_URL}/api/health (database + OCR assets)
  □ Verify: GET ${APP_URL}/api/integrations/health (while logged in)
  □ Team login: Staff → enable app login → employee signs in at /login (Team member tab)
  □ Scan test: upload receipt/invoice without OPENAI_API_KEY — expect ocrSource "local"
`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
