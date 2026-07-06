/**
 * Verify production readiness without starting the server.
 * Usage: npm run production:verify
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { loadEnvFile } from "./production-checklist-utils";

function tesseractAssetsReady(): boolean {
  const base = join(process.cwd(), "public", "tesseract");
  return (
    existsSync(join(base, "worker.min.js")) &&
    existsSync(join(base, "tesseract-core-simd-lstm.wasm.js")) &&
    existsSync(join(base, "lang", "eng.traineddata.gz"))
  );
}

async function main() {
  loadEnvFile();
  const { getIntegrationHealth, summarizeIntegrationHealth } = await import(
    "../src/lib/integrations/health"
  );
  const { validateProductionEnv, isSqliteDatabase } = await import("../src/lib/env");

  const processEnv = process.env as Record<string, string | undefined>;
  const prev = processEnv.NODE_ENV;
  processEnv.NODE_ENV = "production";
  if (isSqliteDatabase()) processEnv.ALLOW_SQLITE_PRODUCTION = "true";

  console.log("=== Production env validation ===");
  try {
    validateProductionEnv();
    console.log("PASS\n");
  } catch (err) {
    console.error(`FAIL: ${err instanceof Error ? err.message : err}\n`);
    process.exitCode = 1;
  }

  console.log("=== OCR assets ===");
  const ocrAssets = tesseractAssetsReady();
  console.log(ocrAssets ? "PASS — public/tesseract assets present\n" : "FAIL — run npm install or node scripts/copy-tesseract-public.mjs\n");
  if (!ocrAssets) process.exitCode = 1;

  console.log("=== Integration health ===");
  const summary = summarizeIntegrationHealth(getIntegrationHealth());
  console.log(
    `Live: ${summary.live} | Demo: ${summary.demo} | Optional: ${summary.optional} | Not configured: ${summary.notConfigured}`
  );
  for (const s of summary.statuses) {
    const icon = s.mode === "live" ? "✓" : s.mode === "not_configured" ? "✗" : "○";
    console.log(`  ${icon} [${s.mode}] ${s.name}: ${s.message}`);
  }

  if (prev !== undefined) processEnv.NODE_ENV = prev;
  else delete processEnv.NODE_ENV;
  delete processEnv.ALLOW_SQLITE_PRODUCTION;
}

main();
