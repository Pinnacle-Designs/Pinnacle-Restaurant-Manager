import type { PlanId } from "./plans";
import { getAuthSecret } from "./env";

export const WORKSPACE_COOKIE_NAME = "pinnacle_workspace";
export const WORKSPACE_COOKIE_MAX_AGE = 60 * 60 * 24 * 7;

export interface WorkspaceSnapshot {
  locationId: string;
  plan: PlanId;
  autopayEnabled: boolean;
  billingRequired: boolean;
  trialActive: boolean;
  stripeSubscriptionActive: boolean;
  setupComplete: boolean;
  exp: number;
}

function getSecret(): string {
  return getAuthSecret();
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(str: string): Uint8Array {
  const base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function importHmacKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(getSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

async function signPayload(payload: string): Promise<string> {
  const key = await importHmacKey();
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return toBase64Url(new Uint8Array(sig));
}

async function verifyPayload(payload: string, signature: string): Promise<boolean> {
  try {
    const key = await importHmacKey();
    const sigBytes = Uint8Array.from(fromBase64Url(signature));
    return crypto.subtle.verify("HMAC", key, sigBytes, new TextEncoder().encode(payload));
  } catch {
    return false;
  }
}

export async function createWorkspaceCookieToken(
  snapshot: WorkspaceSnapshot
): Promise<string> {
  const payload = toBase64Url(
    new TextEncoder().encode(JSON.stringify(snapshot))
  );
  const sig = await signPayload(payload);
  return `${payload}.${sig}`;
}

export async function parseWorkspaceCookieToken(
  token: string | undefined
): Promise<WorkspaceSnapshot | null> {
  if (!token) return null;
  try {
    const [payload, sig] = token.split(".");
    if (!payload || !sig) return null;
    if (!(await verifyPayload(payload, sig))) return null;

    const decoded = new TextDecoder().decode(fromBase64Url(payload));
    if (!decoded.trim()) return null;

    const data = JSON.parse(decoded) as WorkspaceSnapshot;
    if (data.exp < Date.now()) return null;
    return data;
  } catch {
    return null;
  }
}

export function workspaceCookieOptions(token: string, secure?: boolean) {
  const useSecure = secure ?? process.env.NODE_ENV === "production";
  return {
    name: WORKSPACE_COOKIE_NAME,
    value: token,
    httpOnly: true,
    secure: useSecure,
    sameSite: "lax" as const,
    path: "/",
    maxAge: WORKSPACE_COOKIE_MAX_AGE,
  };
}

export function clearWorkspaceCookieOptions() {
  return {
    name: WORKSPACE_COOKIE_NAME,
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 0,
  };
}
