import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  loginUser,
  getSessionUserFromRequest,
  AUTH_COOKIE_NAME,
} from "@/lib/auth";
import { prepareAuthSession } from "@/lib/auth-cookies";
import { isDemoAccountEmail } from "@/lib/demo-email";
import {
  ensureSeededDemoData,
  resolveDemoAccountLocationId,
  resolveOwnerDemoLocationId,
} from "@/lib/demo-location";
import { seedDemoUsers } from "@/lib/demo-users";
import { LOCATION_COOKIE_NAME } from "@/lib/location";
import { resolveEmbedPath, resolveEmbedChrome, embedQueryValue } from "@/lib/embed-config";
import { applyEmbedAuthCookies } from "@/lib/embed-cookies";
import { EMBED_SESSION_PARAM } from "@/lib/embed-constants";

export { EMBED_SESSION_PARAM } from "@/lib/embed-constants";

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

export async function buildEmbedLaunchResponse(
  request: NextRequest,
  pathParam: string | null
): Promise<NextResponse> {
  const path = resolveEmbedPath(pathParam);
  const chrome = resolveEmbedChrome(request.nextUrl.searchParams.get("chrome"));
  const embedValue = embedQueryValue(chrome);
  const existing = await getSessionUserFromRequest(request);

  if (existing) {
    const redirectUrl = new URL(`${path}?embed=${embedValue}`, request.url);
    let locationId =
      request.cookies.get(LOCATION_COOKIE_NAME)?.value ?? existing.locationId ?? "";

    if (isDemoAccountEmail(existing.email)) {
      locationId =
        (await resolveDemoAccountLocationId(
          existing.id,
          existing.email,
          locationId || existing.locationId
        )) ?? locationId;
      await ensureSeededDemoData(locationId);
    }

    let token = request.cookies.get(AUTH_COOKIE_NAME)?.value ?? "";
    try {
      const prepared = await prepareAuthSession({
        ...existing,
        locationId: locationId || existing.locationId,
      });
      token = prepared.sessionToken;
    } catch (err) {
      console.error("Embed session refresh failed:", err);
    }

    // Iframes need _st on every launch so middleware can refresh SameSite=None cookies.
    if (token) {
      redirectUrl.searchParams.set(EMBED_SESSION_PARAM, token);
    }

    const response = NextResponse.redirect(redirectUrl);
    if (token && locationId) {
      applyEmbedAuthCookies(response, request, token, locationId, true);
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
    locationId = await resolveOwnerDemoLocationId(user.id, user.locationId);
    await ensureSeededDemoData(locationId);
  } catch (err) {
    console.error("Embed launch demo setup failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Demo setup failed" },
      { status: 500 }
    );
  }

  let token: string;
  try {
    const prepared = await prepareAuthSession({ ...user, locationId });
    token = prepared.sessionToken;
  } catch (err) {
    console.error("Embed session token failed:", err);
    return NextResponse.json(
      { error: "Demo authentication unavailable. Check server configuration." },
      { status: 503 }
    );
  }

  const redirectUrl = new URL(`${path}?embed=${embedValue}`, request.url);

  // Iframes often drop Set-Cookie on redirect — pass the session once in the URL.
  redirectUrl.searchParams.set(EMBED_SESSION_PARAM, token);

  const response = NextResponse.redirect(redirectUrl);
  applyEmbedAuthCookies(response, request, token, locationId, true);
  return response;
}
