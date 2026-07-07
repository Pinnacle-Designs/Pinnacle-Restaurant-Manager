import { NextRequest } from "next/server";
import { getSessionUserFromRequest, loginUser } from "@/lib/auth";
import { prepareAuthSession, attachAuthCookies } from "@/lib/auth-cookies";
import { getClientIp } from "@/lib/client-ip";
import { isRateLimited } from "@/lib/rate-limit";
import { privateJsonResponse } from "@/lib/secure-response";
import { requireActiveAccount } from "@/lib/api-auth";
import { isProCleanAccountEmail, ensureProCleanAccount } from "@/lib/pro-clean-account";
import {
  completeProCleanLogin,
} from "@/lib/pro-clean-login";
import { LOCATION_COOKIE_NAME } from "@/lib/location";

const LOGIN_FAILURE_DELAY_MS = 250;

async function rejectLogin() {
  await new Promise((resolve) => setTimeout(resolve, LOGIN_FAILURE_DELAY_MS));
  return privateJsonResponse({ error: "Invalid email or password" }, { status: 401 });
}

export async function GET(request: NextRequest) {
  const user = await getSessionUserFromRequest(request);
  if (!user || !isProCleanAccountEmail(user.email)) {
    return privateJsonResponse({ user: null });
  }

  const { user: activeUser, error } = await requireActiveAccount(user);
  if (error || !activeUser) {
    return privateJsonResponse({ user: null });
  }

  const ensured = await ensureProCleanAccount({ resetPassword: false });
  const sessionUser = ensured.locationId
    ? { ...activeUser, locationId: ensured.locationId }
    : activeUser;

  const prepared = await prepareAuthSession(sessionUser);
  const response = privateJsonResponse({ user: prepared.sessionUser });
  attachAuthCookies(response, prepared);
  if (prepared.sessionUser.locationId) {
    response.cookies.set(LOCATION_COOKIE_NAME, "", {
      path: "/",
      maxAge: 0,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
    });
    response.cookies.set(LOCATION_COOKIE_NAME, prepared.sessionUser.locationId, {
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
    });
  }
  return response;
}

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  if (await isRateLimited(`pro-login:ip:${ip}`, 20, 60_000)) {
    return privateJsonResponse(
      { error: "Too many login attempts. Try again shortly." },
      { status: 429 }
    );
  }

  const body = await request.json();
  const email = String(body.email || "").trim().toLowerCase();

  if (!isProCleanAccountEmail(email)) {
    return privateJsonResponse(
      {
        error: "This sign-in page is only for the Pro clean workspace account.",
        loginUrl: "/login",
      },
      { status: 403 }
    );
  }

  if (await isRateLimited(`pro-login:email:${email}`, 10, 60_000)) {
    return privateJsonResponse(
      { error: "Too many login attempts. Try again shortly." },
      { status: 429 }
    );
  }

  const user = await loginUser(email, body.password);
  if (!user) {
    return rejectLogin();
  }

  return completeProCleanLogin({ request, user, email });
}
