import type { NextRequest, NextResponse } from "next/server";
import {
  sessionCookieOptions,
  AUTH_COOKIE_MAX_AGE,
} from "@/lib/session";
import { LOCATION_COOKIE_NAME } from "@/lib/location-constants";
import { EMBED_API_COOKIE_NAME } from "@/lib/embed-constants";

export function requestIsHttps(request: NextRequest): boolean {
  if (request.nextUrl.protocol === "https:") return true;
  return request.headers.get("x-forwarded-proto") === "https";
}

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

export function embedCookieFlags(request: NextRequest, forEmbed: boolean) {
  const https = requestIsHttps(request);
  // SameSite=None requires Secure; modern browsers allow Secure on http://localhost.
  if (forEmbed) {
    return {
      sameSite: "none" as const,
      secure: true,
    };
  }
  return {
    sameSite: "lax" as const,
    secure: https || process.env.NODE_ENV === "production",
  };
}

export function applyEmbedAuthCookies(
  response: NextResponse,
  request: NextRequest,
  token: string,
  locationId: string,
  forEmbed: boolean
) {
  const flags = embedCookieFlags(request, forEmbed);
  response.cookies.set(sessionCookieOptions(token, forEmbed, flags.secure));
  if (locationId) {
    response.cookies.set(LOCATION_COOKIE_NAME, locationId, {
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      sameSite: flags.sameSite,
      secure: flags.secure,
    });
  }
  if (forEmbed) {
    response.cookies.set({
      name: EMBED_API_COOKIE_NAME,
      value: token,
      httpOnly: false,
      secure: flags.secure,
      sameSite: flags.sameSite,
      path: "/",
      maxAge: AUTH_COOKIE_MAX_AGE,
      partitioned: true,
    });
  }
  return response;
}
