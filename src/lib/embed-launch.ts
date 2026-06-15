import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  loginUser,
  createSessionToken,
  getSessionUserFromRequest,
  AUTH_COOKIE_NAME,
} from "@/lib/auth";
import { seedDemoUsers } from "@/lib/demo-users";
import { LOCATION_COOKIE_NAME } from "@/lib/location";
import { resolveEmbedPath, resolveEmbedChrome, embedQueryValue } from "@/lib/embed-config";
import { applyEmbedAuthCookies } from "@/lib/embed-cookies";
import { demoLocationName, setupDemoWorkspace } from "@/lib/seed-data";
import { EMBED_SESSION_PARAM } from "@/lib/embed-session-middleware";
import { prisma } from "@/lib/prisma";

export { EMBED_SESSION_PARAM };

const DEMO_EMAIL = "owner@pinnacle.com";
const DEMO_PASSWORD = "demo1234";

/** True when the iframe parent is on a different origin (needs SameSite=None cookies). */
export function isCrossOriginEmbedRequest(request: NextRequest): boolean {
  const secFetchSite = request.headers.get("sec-fetch-site");
  if (secFetchSite === "cross-site") return true;

  const origin = request.headers.get("origin");
  if (origin) {
    try {
      if (new URL(origin).origin !== request.nextUrl.origin) return true;
    } catch {
      /* ignore */
    }
  }

  const referer = request.headers.get("referer");
  if (referer) {
    try {
      if (new URL(referer).origin !== request.nextUrl.origin) return true;
    } catch {
      /* ignore */
    }
  }

  return false;
}

/** Resolve demo location — deploy DB is pre-seeded at build time; only write when missing. */
async function resolveDemoLocationId(userId: string, existingLocationId: string | null): Promise<string> {
  if (existingLocationId) {
    const location = await prisma.location.findUnique({
      where: { id: existingLocationId },
      select: { id: true },
    });
    if (location) return location.id;
  }

  const demoLocation = await prisma.location.findFirst({
    where: { name: demoLocationName("seeded") },
    select: { id: true },
  });
  if (demoLocation) {
    if (!existingLocationId) {
      await prisma.user.update({
        where: { id: userId },
        data: { locationId: demoLocation.id },
      });
    }
    return demoLocation.id;
  }

  const workspace = await setupDemoWorkspace("seeded");
  if (!existingLocationId) {
    await prisma.user.update({
      where: { id: userId },
      data: { locationId: workspace.locationId },
    });
  }
  return workspace.locationId;
}

export async function buildEmbedLaunchResponse(
  request: NextRequest,
  pathParam: string | null
): Promise<NextResponse> {
  const path = resolveEmbedPath(pathParam);
  const chrome = resolveEmbedChrome(request.nextUrl.searchParams.get("chrome"));
  const embedValue = embedQueryValue(chrome);
  const forEmbed = isCrossOriginEmbedRequest(request);
  const existing = await getSessionUserFromRequest(request);

  if (existing) {
    const redirectUrl = new URL(`${path}?embed=${embedValue}`, request.url);
    const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;
    const locationId =
      request.cookies.get(LOCATION_COOKIE_NAME)?.value ?? existing.locationId ?? "";

    // Cross-origin iframes need _st on every launch so middleware can refresh SameSite=None cookies.
    if (forEmbed && token) {
      redirectUrl.searchParams.set(EMBED_SESSION_PARAM, token);
    }

    const response = NextResponse.redirect(redirectUrl);
    if (token && locationId) {
      applyEmbedAuthCookies(response, request, token, locationId, forEmbed);
    }
    return response;
  }

  let user = await loginUser(DEMO_EMAIL, DEMO_PASSWORD);
  if (!user) {
    try {
      await seedDemoUsers();
    } catch (err) {
      console.error("Embed seedDemoUsers failed:", err);
    }
    user = await loginUser(DEMO_EMAIL, DEMO_PASSWORD);
  }

  if (!user) {
    return NextResponse.json({ error: "Demo login failed" }, { status: 500 });
  }

  let locationId: string;
  try {
    locationId = await resolveDemoLocationId(user.id, user.locationId);
  } catch (err) {
    console.error("Embed launch demo setup failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Demo setup failed" },
      { status: 500 }
    );
  }

  let token: string;
  try {
    token = await createSessionToken({ ...user, locationId });
  } catch (err) {
    console.error("Embed session token failed:", err);
    return NextResponse.json(
      { error: "Demo authentication unavailable. Check server configuration." },
      { status: 503 }
    );
  }

  const redirectUrl = new URL(`${path}?embed=${embedValue}`, request.url);

  // Cross-origin iframes often block Set-Cookie on redirect; pass token once in URL.
  if (forEmbed) {
    redirectUrl.searchParams.set(EMBED_SESSION_PARAM, token);
  }

  const response = NextResponse.redirect(redirectUrl);
  applyEmbedAuthCookies(response, request, token, locationId, forEmbed);
  return response;
}
