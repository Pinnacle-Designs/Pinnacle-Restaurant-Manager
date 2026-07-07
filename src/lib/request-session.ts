import type { NextRequest } from "next/server";
import { AUTH_COOKIE_NAME, parseSessionToken, type SessionUser } from "./session";
import { API_SESSION_COOKIE_NAME, EMBED_API_COOKIE_NAME, EMBED_SESSION_PARAM } from "./embed-constants";
import { isEmbeddableEmbedParam } from "./embed-config";

/**
 * Read session JWT. The httpOnly auth cookie is authoritative for normal app use.
 * Embed `_st` / embed cookies apply only inside an embed context.
 */
export function getRequestSessionToken(request: NextRequest): string | undefined {
  const embedParam = request.nextUrl.searchParams.get("embed");
  const isEmbed = isEmbeddableEmbedParam(embedParam);
  const embedSt = request.nextUrl.searchParams.get(EMBED_SESSION_PARAM);

  if (isEmbed && embedSt) return embedSt;

  const httpOnlyCookie = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  if (httpOnlyCookie) return httpOnlyCookie;

  if (isEmbed) {
    const auth = request.headers.get("authorization");
    if (auth?.toLowerCase().startsWith("bearer ")) {
      const bearer = auth.slice(7).trim();
      if (bearer) return bearer;
    }

    const embedCookie = request.cookies.get(EMBED_API_COOKIE_NAME)?.value;
    if (embedCookie) return embedCookie;
  }

  // Readable mirror for multipart uploads when httpOnly cookie is not sent (PWA).
  const apiCookie = request.cookies.get(API_SESSION_COOKIE_NAME)?.value;
  if (apiCookie) return apiCookie;

  if (!isEmbed) {
    const auth = request.headers.get("authorization");
    if (auth?.toLowerCase().startsWith("bearer ")) {
      const bearer = auth.slice(7).trim();
      if (bearer) return bearer;
    }
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
