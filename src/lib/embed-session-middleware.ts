import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { parseSessionToken, sessionCookieOptions } from "@/lib/session";
import { LOCATION_COOKIE_NAME } from "@/lib/location-constants";

import { isEmbeddableEmbedParam } from "@/lib/embed-config";

export const EMBED_SESSION_PARAM = "_st";

function requestIsHttps(request: NextRequest): boolean {
  if (request.nextUrl.protocol === "https:") return true;
  return request.headers.get("x-forwarded-proto") === "https";
}

function embedCookieFlags(request: NextRequest, forEmbed: boolean) {
  const https = requestIsHttps(request);
  if (forEmbed) {
    return { sameSite: "none" as const, secure: true };
  }
  return {
    sameSite: "lax" as const,
    secure: https || process.env.NODE_ENV === "production",
  };
}

/** Strip `_st` from embed URLs and persist session cookies for cross-origin iframes. */
export async function applyEmbedSessionParam(
  request: NextRequest
): Promise<NextResponse | null> {
  const embedParam = request.nextUrl.searchParams.get("embed");
  const rawToken = request.nextUrl.searchParams.get(EMBED_SESSION_PARAM);
  if (!rawToken || !isEmbeddableEmbedParam(embedParam)) return null;

  const user = await parseSessionToken(rawToken);
  if (!user) return null;

  const clean = new URL(request.url);
  clean.searchParams.delete(EMBED_SESSION_PARAM);

  const response = NextResponse.redirect(clean);
  const forEmbed = true;
  const flags = embedCookieFlags(request, forEmbed);
  response.cookies.set(sessionCookieOptions(rawToken, forEmbed, flags.secure));

  const locationId =
    request.cookies.get(LOCATION_COOKIE_NAME)?.value ?? user.locationId ?? undefined;
  if (locationId) {
    response.cookies.set(LOCATION_COOKIE_NAME, locationId, {
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      sameSite: flags.sameSite,
      secure: flags.secure,
    });
  }

  return response;
}
