import type { NextRequest, NextResponse } from "next/server";
import { sessionCookieOptions, AUTH_COOKIE_MAX_AGE } from "@/lib/auth";
import { LOCATION_COOKIE_NAME } from "@/lib/location";
import { EMBED_API_COOKIE_NAME } from "@/lib/embed-constants";

export function requestIsHttps(request: NextRequest): boolean {
  if (request.nextUrl.protocol === "https:") return true;
  return request.headers.get("x-forwarded-proto") === "https";
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
