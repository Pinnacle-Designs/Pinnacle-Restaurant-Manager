import type { NextRequest } from "next/server";
import { cookies, headers } from "next/headers";
import { scryptSync, randomBytes, timingSafeEqual } from "crypto";
import { prisma } from "./prisma";
import {
  type SessionUser,
  parseSessionToken,
  AUTH_COOKIE_NAME,
} from "./session";
import { getRequestSessionUser } from "./request-session";
import {
  EMBED_API_COOKIE_NAME,
  EMBED_SESSION_HEADER,
} from "./embed-constants";

export type { SessionUser } from "./session";
export {
  createSessionToken,
  parseSessionToken,
  sessionCookieOptions,
  clearSessionCookieOptions,
  AUTH_COOKIE_NAME,
  AUTH_COOKIE_MAX_AGE,
} from "./session";

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const test = scryptSync(password, salt, 64);
  const target = Buffer.from(hash, "hex");
  if (test.length !== target.length) return false;
  return timingSafeEqual(test, target);
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const hdrs = await headers();
  const embedHeader = hdrs.get(EMBED_SESSION_HEADER);
  if (embedHeader) {
    const fromHeader = await parseSessionToken(embedHeader);
    if (fromHeader) return fromHeader;
  }

  const cookieStore = await cookies();
  const token =
    cookieStore.get(AUTH_COOKIE_NAME)?.value ??
    cookieStore.get(EMBED_API_COOKIE_NAME)?.value;

  if (!token) return null;
  return parseSessionToken(token);
}

export async function getSessionUserFromRequest(
  request: NextRequest
): Promise<SessionUser | null> {
  return getRequestSessionUser(request);
}

export async function requireSessionUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new Error("Unauthorized");
  return user;
}

export async function requireSessionUserFromRequest(
  request: NextRequest
): Promise<SessionUser> {
  const user = await getSessionUserFromRequest(request);
  if (!user) throw new Error("Unauthorized");
  return user;
}

export async function loginUser(
  email: string,
  password: string
): Promise<SessionUser | null> {
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!user || !user.active || !verifyPassword(password, user.passwordHash)) {
    return null;
  }
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    locationId: user.locationId,
  };
}
