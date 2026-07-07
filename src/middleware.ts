import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { parseSessionToken } from "@/lib/session";
import { getRequestSessionToken } from "@/lib/request-session";
import { canAccessRoute } from "@/lib/permissions";
import { canAccessPlanRoute } from "@/lib/plans";
import { isPlatformAdmin } from "@/lib/platform-admin";
import {
  getEmbedFrameAncestors,
  getMarketingFrameAncestors,
  isEmbeddableRequest,
  isEmbeddableEmbedParam,
} from "@/lib/embed-config";
import { applyEmbedSessionParam } from "@/lib/embed-session-middleware";
import {
  WORKSPACE_COOKIE_NAME,
  parseWorkspaceCookieToken,
} from "@/lib/workspace-cookie";
import { hasActiveBilling, isBillingAllowedPath } from "@/lib/plan-billing";
import type { PlanId } from "@/lib/plans";
import { isCrossSiteMutation } from "@/lib/csrf";
import {
  emailVerificationRequired,
  isEmailVerificationAllowedPath,
  isMfaSetupAllowedPath,
  ownerMfaRequired,
} from "@/lib/mfa-policy";
import {
  isProCleanAccountEmail,
  PRO_CLEAN_LOGIN_PATH,
} from "@/lib/pro-clean-email";

const PUBLIC_PATHS = [
  "/",
  "/demo",
  "/embed",
  "/login",
  "/login/pro",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
  "/privacy",
  "/terms",
  "/docs",
  "/sales-deck",
  "/api/auth/login",
  "/api/auth/pro-login",
  "/api/auth/pin-login",
  "/api/auth/team-roster",
  "/api/auth/mfa/verify",
  "/api/auth/register",
  "/api/auth/forgot-password",
  "/api/auth/reset-password",
  "/api/auth/verify-email",
  "/api/auth/seed",
  "/api/embed/launch",
  "/api/app-version",
  "/api/health",
  "/api/setup/pro-account",
  "/api/pitch-request",
  "/api/webhooks/stripe",
  "/api/account/billing/square/callback",
  "/api/account/billing/stripe/connect/callback",
  "/apply",
  "/onboard",
  "/api/hiring/apply",
  "/api/hiring/onboarding",
  "/api/hiring/webhook/sms",
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
    "camera=(self), microphone=(), geolocation=(self), payment=()"
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
    pathname.startsWith("/download") ||
    pathname.startsWith("/api/onboarding") ||
    pathname.startsWith("/api/account/billing/stripe/") ||
    pathname.startsWith("/api/auth/logout")
  );
}

async function resolveEffectivePlan(
  request: NextRequest,
  sessionPlan?: PlanId
): Promise<PlanId> {
  // Session JWT is refreshed from the database on GET /api/auth/login (AuthProvider mount).
  if (sessionPlan) return sessionPlan;

  const workspaceToken = request.cookies.get(WORKSPACE_COOKIE_NAME)?.value;
  const workspace = await parseWorkspaceCookieToken(workspaceToken);
  if (workspace?.plan) return workspace.plan;

  return "STARTER";
}

export async function middleware(request: NextRequest) {
  try {
    return await runMiddleware(request);
  } catch (err) {
    console.error("[middleware] unhandled error:", err);
    return applyFramePolicy(
      request,
      NextResponse.json(
        { error: "Service temporarily unavailable" },
        { status: 503 }
      )
    );
  }
}

async function runMiddleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const embedParam = request.nextUrl.searchParams.get("embed");

  if (request.method === "OPTIONS" && pathname.startsWith("/api/")) {
    return applyFramePolicy(request, new NextResponse(null, { status: 204 }));
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

  // Installed app opens at /login — skip sign-in when session is still valid.
  if (pathname === PRO_CLEAN_LOGIN_PATH) {
    const token = getRequestSessionToken(request);
    const sessionUser = token ? await parseSessionToken(token) : null;
    if (sessionUser?.email && isProCleanAccountEmail(sessionUser.email)) {
      return applyFramePolicy(request, NextResponse.redirect(new URL("/dashboard", request.url)));
    }
    if (sessionUser && !isProCleanAccountEmail(sessionUser.email)) {
      return applyFramePolicy(request, NextResponse.redirect(new URL("/login", request.url)));
    }
    return applyFramePolicy(request, NextResponse.next());
  }

  if (pathname === "/login") {
    // LoginForm handles session refresh and account switching — do not redirect here.
    return applyFramePolicy(request, NextResponse.next());
  }

  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return applyFramePolicy(request, NextResponse.next());
  }

  if (
    pathname.startsWith("/api/") &&
    isCrossSiteMutation(request) &&
    !pathname.startsWith("/api/webhooks/")
  ) {
    return applyFramePolicy(
      request,
      NextResponse.json({ error: "Forbidden" }, { status: 403 })
    );
  }

  const token = getRequestSessionToken(request);
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
  const workspace = await parseWorkspaceCookieToken(
    request.cookies.get(WORKSPACE_COOKIE_NAME)?.value
  );
  const plan = await resolveEffectivePlan(request, user.plan);

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
    !isOnboardingAllowedPath(pathname) &&
    !isEmbeddableEmbedParam(embedParam)
  ) {
    if (pathname.startsWith("/api/")) {
      return applyFramePolicy(
        request,
        NextResponse.json({ error: "Complete onboarding first" }, { status: 403 })
      );
    }
    return applyFramePolicy(request, NextResponse.redirect(new URL("/onboarding", request.url)));
  }

  if (ownerMfaRequired(user) && !isMfaSetupAllowedPath(pathname)) {
    if (pathname.startsWith("/api/")) {
      return applyFramePolicy(
        request,
        NextResponse.json(
          { error: "Two-factor authentication is required for owner accounts." },
          { status: 403 }
        )
      );
    }
    const securityUrl = new URL("/account", request.url);
    securityUrl.searchParams.set("tab", "security");
    securityUrl.searchParams.set("mfa", "required");
    return applyFramePolicy(request, NextResponse.redirect(securityUrl));
  }

  if (emailVerificationRequired(user) && !isEmailVerificationAllowedPath(pathname)) {
    if (pathname.startsWith("/api/")) {
      return applyFramePolicy(
        request,
        NextResponse.json({ error: "Verify your email address to continue." }, { status: 403 })
      );
    }
    const profileUrl = new URL("/account", request.url);
    profileUrl.searchParams.set("tab", "profile");
    profileUrl.searchParams.set("verify", "required");
    return applyFramePolicy(request, NextResponse.redirect(profileUrl));
  }

  if (
    !platformAdmin &&
    workspace?.setupComplete &&
    !hasActiveBilling(workspace) &&
    !isBillingAllowedPath(pathname) &&
    !isEmbeddableEmbedParam(embedParam)
  ) {
    if (pathname.startsWith("/api/")) {
      return applyFramePolicy(
        request,
        NextResponse.json(
          { error: "Active subscription required. Set up billing in Account settings." },
          { status: 402 }
        )
      );
    }
    const billingUrl = new URL("/account", request.url);
    billingUrl.searchParams.set("tab", "billing");
    billingUrl.searchParams.set("billing", "required");
    return applyFramePolicy(request, NextResponse.redirect(billingUrl));
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

  if (!canAccessPlanRoute(plan, pathname)) {
    if (pathname.startsWith("/api/")) {
      return applyFramePolicy(
        request,
        NextResponse.json({ error: "Upgrade your plan to access this feature" }, { status: 403 })
      );
    }
    const upgradeUrl = new URL("/dashboard", request.url);
    const feature = pathname.split("/").filter(Boolean)[0] ?? "";
    upgradeUrl.searchParams.set("upgrade", feature);
    return applyFramePolicy(request, NextResponse.redirect(upgradeUrl));
  }

  return applyFramePolicy(request, NextResponse.next());
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
