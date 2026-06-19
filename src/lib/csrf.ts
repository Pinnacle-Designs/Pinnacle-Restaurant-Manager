import type { NextRequest } from "next/server";

/** Reject cross-site cookie-authenticated mutations when Origin/Referer is present and mismatched. */
export function isCrossSiteMutation(request: NextRequest): boolean {
  const method = request.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
    return false;
  }

  const expected = request.nextUrl.origin;
  const origin = request.headers.get("origin");
  if (origin && origin !== expected && origin !== "null") {
    return true;
  }

  const referer = request.headers.get("referer");
  if (referer) {
    try {
      const refOrigin = new URL(referer).origin;
      if (refOrigin !== expected) return true;
    } catch {
      return true;
    }
  }

  return false;
}
