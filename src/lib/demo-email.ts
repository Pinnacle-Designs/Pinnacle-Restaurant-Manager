/** Demo account emails — shared without pulling in auth/crypto (Edge-safe). */
export const OWNER_DEMO_EMAIL = "owner@pinnacle.com";

const DEMO_EMAILS = new Set([
  OWNER_DEMO_EMAIL,
  "manager@pinnacle.com",
  "server@pinnacle.com",
  "kitchen@pinnacle.com",
  "host@pinnacle.com",
]);

const PLAN_DEMO_EMAILS = new Set([
  "demo-starter@pinnacle.com",
  "demo-growth@pinnacle.com",
  "demo-pro@pinnacle.com",
]);

export function isDemoAccountEmail(email: string): boolean {
  return DEMO_EMAILS.has(email.trim().toLowerCase());
}

export function isPlanDemoAccountEmail(email: string): boolean {
  return PLAN_DEMO_EMAILS.has(email.trim().toLowerCase());
}
