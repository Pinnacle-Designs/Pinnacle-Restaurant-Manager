import type { NextRequest } from "next/server";
import { AUTH_COOKIE_NAME, parseSessionToken, type SessionUser } from "./session";
import { EMBED_SESSION_PARAM } from "./embed-constants";

/**
 * Read session JWT. When `_st` is present it wins over cookies so the demo works
 * in normal browsers that still have an old login session.
 */
export function getRequestSessionToken(request: NextRequest): string | undefined {
  const embedSt = request.nextUrl.searchParams.get(EMBED_SESSION_PARAM);
  if (embedSt) return embedSt;

  const cookie = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  if (cookie) return cookie;

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
