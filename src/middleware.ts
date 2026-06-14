import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { parseSessionToken, AUTH_COOKIE_NAME } from "@/lib/session";
import { canAccessRoute } from "@/lib/permissions";
import { getEmbedFrameAncestors, isEmbeddableRequest } from "@/lib/embed-config";

const PUBLIC_PATHS = ["/", "/demo", "/embed", "/login", "/api/auth/login", "/api/auth/seed"];

function applyFramePolicy(request: NextRequest, response: NextResponse): NextResponse {
  const { pathname } = request.nextUrl;
  const embedParam = request.nextUrl.searchParams.get("embed");

  if (isEmbeddableRequest(pathname, embedParam)) {
    response.headers.set(
      "Content-Security-Policy",
      `frame-ancestors ${getEmbedFrameAncestors()}`
    );
  } else {
    response.headers.set("Content-Security-Policy", "frame-ancestors 'none'");
    response.headers.set("X-Frame-Options", "DENY");
  }

  return response;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const embedParam = request.nextUrl.searchParams.get("embed");

  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/uploads") ||
    pathname.match(/\.(png|svg|jpg|jpeg|ico|json|js)$/)
  ) {
    return applyFramePolicy(request, NextResponse.next());
  }

  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return applyFramePolicy(request, NextResponse.next());
  }

  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  const user = token ? await parseSessionToken(token) : null;

  if (!user) {
    if (pathname.startsWith("/api/")) {
      return applyFramePolicy(
        request,
        NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      );
    }
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("from", pathname);
    if (embedParam === "1") {
      loginUrl.searchParams.set("embed", "1");
    }
    return applyFramePolicy(request, NextResponse.redirect(loginUrl));
  }

  if (!canAccessRoute(user.role, pathname)) {
    if (pathname.startsWith("/api/")) {
      return applyFramePolicy(
        request,
        NextResponse.json({ error: "Forbidden" }, { status: 403 })
      );
    }
    return applyFramePolicy(request, NextResponse.redirect(new URL("/dashboard", request.url)));
  }

  return applyFramePolicy(request, NextResponse.next());
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
