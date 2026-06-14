import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { parseSessionToken, AUTH_COOKIE_NAME } from "@/lib/session";
import { canAccessRoute } from "@/lib/permissions";
import { canAccessPlanRoute } from "@/lib/plans";
import { isPlatformAdmin } from "@/lib/platform-admin";
import { getEmbedFrameAncestors, getMarketingFrameAncestors, isEmbeddableRequest, isEmbeddableEmbedParam } from "@/lib/embed-config";
import { applyEmbedSessionParam } from "@/lib/embed-session-middleware";

const PUBLIC_PATHS = [
  "/",
  "/demo",
  "/embed",
  "/login",
  "/signup",
  "/docs",
  "/api/auth/login",
  "/api/auth/register",
  "/api/auth/seed",
  "/api/auth/plan-demos",
  "/api/embed/launch",
  "/api/pitch-request",
  "/api/webhooks/stripe",
  "/api/account/billing/square/callback",
  "/api/account/billing/stripe/connect/callback",
];

function applyFramePolicy(request: NextRequest, response: NextResponse): NextResponse {
  const { pathname } = request.nextUrl;
  const embedParam = request.nextUrl.searchParams.get("embed");

  if (isEmbeddableRequest(pathname, embedParam)) {
    response.headers.set(
      "Content-Security-Policy",
      `frame-ancestors ${getEmbedFrameAncestors(request)}`
    );
    response.headers.delete("X-Frame-Options");
  } else {
    response.headers.set("Content-Security-Policy", "frame-ancestors 'none'");
    response.headers.set("X-Frame-Options", "DENY");
  }

  return applySecurityHeaders(applyMarketingCors(request, applyDevCors(request, response)));
}

function applySecurityHeaders(response: NextResponse): NextResponse {
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set(
    "Permissions-Policy",
    "camera=(self), microphone=(), geolocation=(), payment=()"
  );
  if (process.env.NODE_ENV === "production") {
    response.headers.set(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains; preload"
    );
  }
  return response;
}

/** Allow GitHub Pages / marketing sites to probe embed launch in production. */
function applyMarketingCors(request: NextRequest, response: NextResponse): NextResponse {
  const origin = request.headers.get("origin");
  if (!origin) return response;

  const allowed =
    origin.endsWith(".github.io") ||
    getMarketingFrameAncestors().includes(origin);

  if (!allowed) return response;

  response.headers.set("Access-Control-Allow-Origin", origin);
  response.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  response.headers.set("Access-Control-Allow-Headers", "Content-Type");
  response.headers.append("Vary", "Origin");
  return response;
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

function isOnboardingAllowedPath(pathname: string): boolean {
  return (
    pathname.startsWith("/onboarding") ||
    pathname.startsWith("/api/onboarding") ||
    pathname.startsWith("/api/account/billing/stripe/") ||
    pathname.startsWith("/api/auth/logout")
  );
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

  const platformAdmin = isPlatformAdmin(user);

  if (pathname.startsWith("/admin") || pathname.startsWith("/api/admin")) {
    if (!platformAdmin) {
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

  if (
    user.role === "OWNER" &&
    user.setupComplete === false &&
    !isOnboardingAllowedPath(pathname)
  ) {
    if (pathname.startsWith("/api/")) {
      return applyFramePolicy(
        request,
        NextResponse.json({ error: "Complete onboarding first" }, { status: 403 })
      );
    }
    return applyFramePolicy(request, NextResponse.redirect(new URL("/onboarding", request.url)));
  }

  if (!canAccessRoute(user.role, pathname, user.permissions)) {
    if (pathname.startsWith("/api/")) {
      return applyFramePolicy(
        request,
        NextResponse.json({ error: "Forbidden" }, { status: 403 })
      );
    }
    return applyFramePolicy(request, NextResponse.redirect(new URL("/dashboard", request.url)));
  }

  if (!canAccessPlanRoute(user.plan, pathname)) {
    if (pathname.startsWith("/api/")) {
      return applyFramePolicy(
        request,
        NextResponse.json({ error: "Upgrade your plan to access this feature" }, { status: 403 })
      );
    }
    const upgradeUrl = new URL("/dashboard", request.url);
    upgradeUrl.searchParams.set("upgrade", pathname.split("/").filter(Boolean)[0] ?? "");
    return applyFramePolicy(request, NextResponse.redirect(upgradeUrl));
  }

  return applyFramePolicy(request, NextResponse.next());
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
