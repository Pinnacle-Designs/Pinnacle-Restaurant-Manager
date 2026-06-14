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
import { setupDemoWorkspace } from "@/lib/seed-data";
import { EMBED_SESSION_PARAM } from "@/lib/embed-session-middleware";

export { EMBED_SESSION_PARAM };

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

  await seedDemoUsers();

  const user = await loginUser("owner@pinnacle.com", "demo1234");
  if (!user) {
    return NextResponse.json({ error: "Demo login failed" }, { status: 500 });
  }

  let workspace;
  try {
    workspace = await setupDemoWorkspace("seeded");
  } catch (err) {
    console.error("Embed launch demo setup failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Demo setup failed" },
      { status: 500 }
    );
  }

  const token = await createSessionToken(user);
  const redirectUrl = new URL(`${path}?embed=${embedValue}`, request.url);

  // Cross-origin iframes often block Set-Cookie on redirect; pass token once in URL.
  if (forEmbed) {
    redirectUrl.searchParams.set(EMBED_SESSION_PARAM, token);
  }

  const response = NextResponse.redirect(redirectUrl);
  applyEmbedAuthCookies(response, request, token, workspace.locationId, forEmbed);
  return response;
}
