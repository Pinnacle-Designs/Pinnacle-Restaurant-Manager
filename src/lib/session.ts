import type { AppRole } from "./app-role";
import type { PlanId } from "./plans";
import type { Permission } from "./permissions";
import { getAuthSecret } from "./env";

export const AUTH_COOKIE_NAME = "pinnacle_session";
export const AUTH_COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days — stay signed in on installed mobile app

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: AppRole;
  locationId: string | null;
  plan?: PlanId;
  avatarUrl?: string | null;
  permissions?: Permission[];
  setupComplete?: boolean;
  isPlatformAdmin?: boolean;
  sessionVersion?: number;
  mfaEnabled?: boolean;
  emailVerifiedAt?: string | null;
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
    new TextEncoder().encode(getAuthSecret()),
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
    return crypto.subtle.verify(
      "HMAC",
      key,
      sigBytes,
      new TextEncoder().encode(payload)
    );
  } catch {
    return false;
  }
}

export async function createSessionToken(user: SessionUser): Promise<string> {
  const payload = toBase64Url(
    new TextEncoder().encode(
      JSON.stringify({
        ...user,
        exp: Date.now() + AUTH_COOKIE_MAX_AGE * 1000,
      })
    )
  );
  const sig = await signPayload(payload);
  return `${payload}.${sig}`;
}

/** Smaller JWT for embed `_st` — permissions resolved server-side from role. */
export async function createCompactSessionToken(user: SessionUser): Promise<string> {
  const payload = toBase64Url(
    new TextEncoder().encode(
      JSON.stringify({
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        locationId: user.locationId,
        plan: user.plan,
        setupComplete: user.setupComplete,
        isPlatformAdmin: user.isPlatformAdmin,
        sessionVersion: user.sessionVersion,
        mfaEnabled: user.mfaEnabled,
        emailVerifiedAt: user.emailVerifiedAt,
        exp: Date.now() + AUTH_COOKIE_MAX_AGE * 1000,
      })
    )
  );
  const sig = await signPayload(payload);
  return `${payload}.${sig}`;
}

export async function parseSessionToken(token: string): Promise<SessionUser | null> {
  try {
    const [payload, sig] = token.split(".");
    if (!payload || !sig) return null;
    if (!(await verifyPayload(payload, sig))) return null;

    const decoded = new TextDecoder().decode(fromBase64Url(payload));
    if (!decoded.trim()) return null;

    const data = JSON.parse(decoded) as SessionUser & {
      exp: number;
    };
    if (data.exp < Date.now()) return null;

    return {
      id: data.id,
      email: data.email,
      name: data.name,
      role: data.role,
      locationId: data.locationId,
      plan: data.plan,
      avatarUrl: data.avatarUrl,
      permissions: data.permissions,
      setupComplete: data.setupComplete,
      isPlatformAdmin: data.isPlatformAdmin,
      sessionVersion: data.sessionVersion,
      mfaEnabled: data.mfaEnabled,
      emailVerifiedAt: data.emailVerifiedAt,
    };
  } catch {
    return null;
  }
}

export function sessionCookieOptions(token: string, forEmbed = false, secure?: boolean) {
  const useSecure = secure ?? (process.env.NODE_ENV === "production" || forEmbed);
  return {
    name: AUTH_COOKIE_NAME,
    value: token,
    httpOnly: true,
    secure: useSecure,
    sameSite: (forEmbed ? "none" : "lax") as "none" | "lax",
    path: "/",
    maxAge: AUTH_COOKIE_MAX_AGE,
  };
}

export function clearSessionCookieOptions() {
  return {
    name: AUTH_COOKIE_NAME,
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 0,
  };
}
