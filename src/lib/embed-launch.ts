import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  loginUser,
  getSessionUserFromRequest,
} from "@/lib/auth";
import { prepareAuthSession, attachAuthCookies } from "@/lib/auth-cookies";
import { createCompactSessionToken } from "@/lib/session";
import { isDemoAccountEmail } from "@/lib/demo-email";
import {
  ensureFullDemoWorkspace,
  resolveDemoAccountLocationId,
  resolveOwnerDemoLocationId,
} from "@/lib/demo-location";
import { seedDemoUsers } from "@/lib/demo-users";
import { resolveEmbedPath, resolveEmbedChrome, embedQueryValue } from "@/lib/embed-config";
import { applyEmbedAuthCookies, requestIsHttps, isCrossOriginEmbedRequest } from "@/lib/embed-cookies";
import { EMBED_SESSION_PARAM } from "@/lib/embed-constants";
import type { SessionUser } from "@/lib/session";

export { EMBED_SESSION_PARAM } from "@/lib/embed-constants";
export { isCrossOriginEmbedRequest } from "@/lib/embed-cookies";

const DEMO_EMAIL = "owner@pinnacle.com";
const DEMO_PASSWORD = "demo1234";

async function buildEmbedRedirect(
  request: NextRequest,
  path: string,
  embedValue: string,
  user: SessionUser,
  locationId: string
): Promise<NextResponse> {
  // Seed in background — hero iframe must redirect immediately.
  void ensureFullDemoWorkspace(locationId, user.id).catch((err) => {
    console.error("Embed background seed failed:", err);
  });

  const prepared = await prepareAuthSession({ ...user, locationId });
  const embedToken = await createCompactSessionToken(prepared.sessionUser);
  const redirectUrl = new URL(`${path}?embed=${embedValue}`, request.url);
  redirectUrl.searchParams.set(EMBED_SESSION_PARAM, embedToken);

  const forEmbed = isCrossOriginEmbedRequest(request);
  const secure = forEmbed || requestIsHttps(request);

  const response = NextResponse.redirect(redirectUrl);
  applyEmbedAuthCookies(response, request, embedToken, locationId, forEmbed);
  attachAuthCookies(response, prepared, { forEmbed, secure });
  return response;
}

export async function buildEmbedLaunchResponse(
  request: NextRequest,
  pathParam: string | null
): Promise<NextResponse> {
  const path = resolveEmbedPath(pathParam);
  const chrome = resolveEmbedChrome(request.nextUrl.searchParams.get("chrome"));
  const embedValue = embedQueryValue(chrome);

  // Only reuse session when it is already the public demo owner account.
  const existing = await getSessionUserFromRequest(request);
  if (existing && isDemoAccountEmail(existing.email)) {
    let locationId = existing.locationId ?? "";

    locationId =
      (await resolveDemoAccountLocationId(
        existing.id,
        existing.email,
        locationId || existing.locationId
      )) ?? locationId;

    if (!locationId) {
      return NextResponse.json({ error: "Demo workspace not found" }, { status: 500 });
    }

    return buildEmbedRedirect(request, path, embedValue, existing, locationId);
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
  } catch (err) {
    console.error("Embed launch demo setup failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Demo setup failed" },
      { status: 500 }
    );
  }

  try {
    return await buildEmbedRedirect(request, path, embedValue, user, locationId);
  } catch (err) {
    console.error("Embed session token failed:", err);
    return NextResponse.json(
      { error: "Demo authentication unavailable. Check server configuration." },
      { status: 503 }
    );
  }
}
