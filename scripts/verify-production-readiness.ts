/**
 * Verify production readiness without starting the server.
 * Usage: npm run production:verify
 */
import { loadEnvFile } from "./production-checklist-utils";

async function main() {
  loadEnvFile();
  const { getIntegrationHealth, summarizeIntegrationHealth } = await import(
    "../src/lib/integrations/health"
  );
  const { validateProductionEnv, isSqliteDatabase } = await import("../src/lib/env");

  const prev = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  if (isSqliteDatabase()) process.env.ALLOW_SQLITE_PRODUCTION = "true";

  console.log("=== Production env validation ===");
  try {
    validateProductionEnv();
    console.log("PASS\n");
  } catch (err) {
    console.error(`FAIL: ${err instanceof Error ? err.message : err}\n`);
    process.exitCode = 1;
  }

  console.log("=== Integration health ===");
  const summary = summarizeIntegrationHealth(getIntegrationHealth());
  console.log(
    `Live: ${summary.live} | Demo: ${summary.demo} | Optional: ${summary.optional} | Not configured: ${summary.notConfigured}`
  );
  for (const s of summary.statuses) {
    const icon = s.mode === "live" ? "✓" : s.mode === "not_configured" ? "✗" : "○";
    console.log(`  ${icon} [${s.mode}] ${s.name}: ${s.message}`);
  }

  process.env.NODE_ENV = prev;
  delete process.env.ALLOW_SQLITE_PRODUCTION;
}

main();
