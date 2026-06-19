#!/usr/bin/env node
/**
 * Push non-empty variables from .env.vercel to Vercel (production, preview, development).
 *
 * Prerequisites:
 *   npx vercel login
 *   npx vercel link
 *   Copy .env.vercel.example → .env.vercel and fill in real values
 *
 * Usage:
 *   npm run vercel:env:push
 *   npm run vercel:env:push -- production   # single target
 */

import { readFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const envFile = resolve(root, process.argv[2] === "production" || process.argv[2] === "preview" || process.argv[2] === "development" ? ".env.vercel" : process.argv[2] || ".env.vercel");
const singleTarget = ["production", "preview", "development"].includes(process.argv[2])
  ? process.argv[2]
  : null;
const targets = singleTarget ? [singleTarget] : ["production", "preview", "development"];

function parseEnv(content) {
  /** @type {Record<string, string>} */
  const vars = {};
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!val) continue;
    vars[key] = val;
  }
  return vars;
}

function runVercel(args, input) {
  const result = spawnSync("npx", ["vercel", ...args], {
    cwd: root,
    input,
    stdio: ["pipe", "inherit", "inherit"],
    shell: true,
    encoding: "utf8",
  });
  return result.status === 0;
}

if (!existsSync(envFile)) {
  console.error(`Missing ${envFile}`);
  console.error("Copy .env.vercel.example → .env.vercel and add your values first.");
  process.exit(1);
}

const vars = parseEnv(readFileSync(envFile, "utf8"));
const keys = Object.keys(vars);
if (keys.length === 0) {
  console.error("No non-empty variables found in", envFile);
  process.exit(1);
}

console.log(`Pushing ${keys.length} variable(s) to Vercel (${targets.join(", ")})…\n`);

let ok = 0;
let fail = 0;

for (const key of keys) {
  const value = vars[key];
  for (const target of targets) {
    process.stdout.write(`  ${key} → ${target} … `);
    const success = runVercel(["env", "add", key, target, "--force"], value);
    if (success) {
      console.log("ok");
      ok += 1;
    } else {
      console.log("FAILED");
      fail += 1;
    }
  }
}

console.log(`\nDone: ${ok} ok, ${fail} failed.`);
if (fail > 0) process.exit(1);
console.log("Redeploy on Vercel for changes to take effect.");
