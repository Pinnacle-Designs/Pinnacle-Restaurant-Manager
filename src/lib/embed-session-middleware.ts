import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { parseSessionToken } from "@/lib/session";
import { applyEmbedAuthCookies } from "@/lib/embed-cookies";
import { LOCATION_COOKIE_NAME } from "@/lib/location-constants";
import { EMBED_SESSION_PARAM } from "@/lib/embed-constants";
import { isEmbeddableEmbedParam } from "@/lib/embed-config";

export { EMBED_SESSION_PARAM } from "@/lib/embed-constants";

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
  const locationId =
    request.cookies.get(LOCATION_COOKIE_NAME)?.value ?? user.locationId ?? "";

  if (locationId) {
    applyEmbedAuthCookies(response, request, rawToken, locationId, true);
  } else if (user.locationId) {
    applyEmbedAuthCookies(response, request, rawToken, user.locationId, true);
  }

  return response;
}
