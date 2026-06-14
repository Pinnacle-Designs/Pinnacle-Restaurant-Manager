import { NextRequest } from "next/server";
import { createSessionToken, hashPassword, sessionCookieOptions } from "@/lib/auth";
import { enrichUserWithPlan } from "@/lib/location-plan";
import { LOCATION_COOKIE_NAME } from "@/lib/location";
import { parsePlanId } from "@/lib/plans";
import { prisma } from "@/lib/prisma";
import { getClientIp } from "@/lib/client-ip";
import { isRateLimited } from "@/lib/rate-limit";
import { validatePassword } from "@/lib/password-policy";
import { privateJsonResponse } from "@/lib/secure-response";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  if (isRateLimited(`register:ip:${ip}`, 5, 60_000)) {
    return privateJsonResponse(
      { error: "Too many sign-up attempts. Try again shortly." },
      { status: 429 }
    );
  }

  const body = await request.json();
  const name = String(body.name || "").trim().slice(0, 120);
  const email = String(body.email || "").trim().toLowerCase().slice(0, 254);
  const password = String(body.password || "");
  const restaurantName =
    String(body.restaurantName || "").trim().slice(0, 120) || `${name}'s Restaurant`;
  const plan = parsePlanId(body.plan) ?? "GROWTH";

  if (!name || !email || !password) {
    return privateJsonResponse(
      { error: "Name, email, and password are required" },
      { status: 400 }
    );
  }

  if (!EMAIL_RE.test(email)) {
    return privateJsonResponse({ error: "Enter a valid email address" }, { status: 400 });
  }

  const passwordError = validatePassword(password);
  if (passwordError) {
    return privateJsonResponse({ error: passwordError }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return privateJsonResponse(
      { error: "Unable to create account. Try a different email or sign in." },
      { status: 400 }
    );
  }

  const location = await prisma.location.create({
    data: {
      name: restaurantName,
      address: "Add your address",
      plan,
      billingEmail: email,
      setupComplete: false,
      onboardingStep: 0,
    },
  });

  const user = await prisma.user.create({
    data: {
      email,
      name,
      passwordHash: hashPassword(password),
      role: "OWNER",
      locationId: location.id,
      active: true,
    },
  });

  const sessionUser = await enrichUserWithPlan({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    locationId: user.locationId,
    setupComplete: false,
  });

  const token = await createSessionToken(sessionUser);
  const response = privateJsonResponse({
    user: sessionUser,
    workspace: {
      locationId: location.id,
      locationName: location.name,
      plan: location.plan,
    },
  });

  response.cookies.set(sessionCookieOptions(token, false));
  response.cookies.set(LOCATION_COOKIE_NAME, location.id, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
  });

  return response;
}
