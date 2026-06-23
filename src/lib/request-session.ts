import type { NextRequest } from "next/server";
import { AUTH_COOKIE_NAME, parseSessionToken, type SessionUser } from "./session";
import { EMBED_SESSION_PARAM } from "./embed-constants";

/** Read session JWT from cookie, embed `_st` query param, or Authorization bearer. */
export function getRequestSessionToken(request: NextRequest): string | undefined {
  const cookie = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  if (cookie) return cookie;

  const embedParam = request.nextUrl.searchParams.get(EMBED_SESSION_PARAM);
  if (embedParam) return embedParam;

  const auth = request.headers.get("authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) {
    return auth.slice(7).trim();
  }

  return undefined;
}

export async function getRequestSessionUser(
  request: NextRequest
): Promise<SessionUser | null> {
  const token = getRequestSessionToken(request);
  if (!token) return null;
  return parseSessionToken(token);
}
