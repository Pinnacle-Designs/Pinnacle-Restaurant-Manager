#!/usr/bin/env node
/**
 * Connect Upstash Redis to the linked Vercel project (rate limiting).
 *
 * Prerequisites:
 *   npx vercel login
 *   npx vercel link
 *
 * Usage:
 *   npm run setup:upstash
 *   npm run setup:upstash -- --connect-existing <resource-name>
 *
 * If Vercel asks you to accept marketplace terms, open the printed URL in a
 * browser, accept, then run this script again.
 */

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const args = process.argv.slice(2);
const connectIdx = args.indexOf("--connect-existing");
const existingResource = connectIdx >= 0 ? args[connectIdx + 1] : null;

function run(cmd, cmdArgs, input) {
  const result = spawnSync(cmd, cmdArgs, {
    cwd: root,
    input,
    stdio: ["pipe", "pipe", "pipe"],
    shell: true,
    encoding: "utf8",
  });
  return {
    ok: result.status === 0,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    status: result.status ?? 1,
  };
}

function hasUpstashEnv(content) {
  return (
    /^(UPSTASH_REDIS_REST_URL|KV_REST_API_URL)=/m.test(content) &&
    /^(UPSTASH_REDIS_REST_TOKEN|KV_REST_API_TOKEN)=/m.test(content)
  );
}

console.log("Upstash → Vercel setup for pinnacle-restaurant-manager\n");

if (existingResource) {
  console.log(`Connecting existing resource "${existingResource}"…`);
  const connect = run("npx", [
    "vercel",
    "integration",
    "resource",
    "connect",
    existingResource,
    "-e",
    "production",
    "-e",
    "preview",
    "-e",
    "development",
    "--yes",
  ]);
  process.stdout.write(connect.stdout);
  process.stderr.write(connect.stderr);
  if (!connect.ok) {
    console.error("\nConnect failed. List resources in Vercel → Storage or Upstash console.");
    process.exit(connect.status);
  }
} else {
  console.log("Provisioning Upstash for Redis (free tier, iad1)…");
  const add = run("npx", [
    "vercel",
    "integration",
    "add",
    "upstash/upstash-kv",
    "-n",
    "pinnacle-restaurant-redis",
    "-m",
    "primaryRegion=iad1",
    "--plan",
    "free",
    "-e",
    "production",
    "-e",
    "preview",
    "-e",
    "development",
    "--format",
    "json",
  ]);
  const out = add.stdout + add.stderr;
  process.stdout.write(out);

  if (!add.ok) {
    if (out.includes("integration_terms_acceptance_required")) {
      const match = out.match(/https:\/\/vercel\.com\/[^\s"]+accept-terms\/upstash[^\s"]*/);
      console.error("\n--- Action required ---");
      console.error("Accept Upstash marketplace terms in your browser:");
      console.error(match?.[0] ?? "https://vercel.com/dashboard → Integrations → Upstash");
      console.error("\nThen run: npm run setup:upstash");
      process.exit(1);
    }
    console.error("\nProvision failed.");
    process.exit(add.status);
  }
}

const envFile = resolve(root, ".env.vercel.production.local");
console.log("\nPulling production env from Vercel…");
const pull = run("npx", [
  "vercel",
  "env",
  "pull",
  ".env.vercel.production.local",
  "--environment=production",
  "--yes",
]);
process.stdout.write(pull.stdout);
process.stderr.write(pull.stderr);

if (existsSync(envFile)) {
  const env = readFileSync(envFile, "utf8");
  if (hasUpstashEnv(env)) {
    console.log("\n✓ Upstash Redis env vars are present on Vercel production.");
    console.log("  Redeploy for rate limiting to activate:");
    console.log("  npx vercel deploy --prod");
  } else {
    console.log("\n⚠ Env pull succeeded but Upstash vars are still missing.");
    console.log("  In Vercel → pinnacle-resturant-manager → Storage → Connect Upstash Redis");
    console.log("  Or paste REST URL + token from console.upstash.com into Vercel env.");
  }
} else {
  console.log("\n⚠ Could not verify env file after pull.");
}
