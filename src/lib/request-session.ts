import type { NextRequest } from "next/server";
import { AUTH_COOKIE_NAME, parseSessionToken, type SessionUser } from "./session";
import { EMBED_SESSION_PARAM } from "./embed-constants";
import { isEmbeddableEmbedParam } from "./embed-config";

/**
 * Read session JWT. Embed `_st` wins only inside an embed context so stale demo
 * tokens cannot override a normal pro-clean / owner cookie session.
 */
export function getRequestSessionToken(request: NextRequest): string | undefined {
  const embedParam = request.nextUrl.searchParams.get("embed");
  const embedSt = request.nextUrl.searchParams.get(EMBED_SESSION_PARAM);
  if (embedSt && isEmbeddableEmbedParam(embedParam)) return embedSt;

  const auth = request.headers.get("authorization");
  if (auth?.toLowerCase().startsWith("bearer ") && isEmbeddableEmbedParam(embedParam)) {
    return auth.slice(7).trim();
  }

  const cookie = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  if (cookie) return cookie;

  return undefined;
}

export async function getRequestSessionUser(
  request: NextRequest
): Promise<SessionUser | null> {
  const token = getRequestSessionToken(request);
  if (!token) return null;
  return parseSessionToken(token);
}
