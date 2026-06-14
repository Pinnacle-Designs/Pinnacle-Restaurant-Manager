import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { parseSessionToken, AUTH_COOKIE_NAME } from "@/lib/session";
import { canAccessRoute } from "@/lib/permissions";
import { getEmbedFrameAncestors, isEmbeddableRequest, isEmbeddableEmbedParam } from "@/lib/embed-config";
import { applyEmbedSessionParam } from "@/lib/embed-session-middleware";

const PUBLIC_PATHS = [
  "/",
  "/demo",
  "/embed",
  "/login",
  "/docs",
  "/api/auth/login",
  "/api/auth/seed",
  "/api/embed/launch",
];

function applyFramePolicy(request: NextRequest, response: NextResponse): NextResponse {
  const { pathname } = request.nextUrl;
  const embedParam = request.nextUrl.searchParams.get("embed");

  if (isEmbeddableRequest(pathname, embedParam)) {
    response.headers.set(
      "Content-Security-Policy",
      `frame-ancestors ${getEmbedFrameAncestors(request)}`
    );
  } else {
    response.headers.set("Content-Security-Policy", "frame-ancestors 'none'");
    response.headers.set("X-Frame-Options", "DENY");
  }

  return applyDevCors(request, response);
}

/** Allow docs/Live Server to probe the app in local development. */
function applyDevCors(request: NextRequest, response: NextResponse): NextResponse {
  if (process.env.NODE_ENV !== "development") return response;

  const origin = request.headers.get("origin");
  if (
    origin &&
    (origin.startsWith("http://localhost:") ||
      origin.startsWith("http://127.0.0.1:") ||
      origin === "null")
  ) {
    response.headers.set("Access-Control-Allow-Origin", origin);
    response.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    response.headers.set("Access-Control-Allow-Headers", "Content-Type");
    response.headers.append("Vary", "Origin");
  }

  return response;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const embedParam = request.nextUrl.searchParams.get("embed");

  if (request.method === "OPTIONS" && pathname.startsWith("/api/")) {
    return applyDevCors(request, new NextResponse(null, { status: 204 }));
  }

  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/uploads") ||
    pathname.match(/\.(png|svg|jpg|jpeg|ico|json|js|css|html)$/)
  ) {
    return applyFramePolicy(request, NextResponse.next());
  }

  const embedSessionRedirect = await applyEmbedSessionParam(request);
  if (embedSessionRedirect) {
    return applyFramePolicy(request, embedSessionRedirect);
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
    if (isEmbeddableEmbedParam(embedParam)) {
      loginUrl.searchParams.set("embed", embedParam!);
      loginUrl.searchParams.set("from", `${pathname}?embed=${embedParam}`);
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
