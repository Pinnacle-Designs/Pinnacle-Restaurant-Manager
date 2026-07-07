import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { LOCATION_COOKIE_NAME } from "@/lib/location";
import { requireSecureAuth } from "@/lib/api-auth";
import { applyAuthCookies } from "@/lib/auth-cookies";
import { isProductionRuntime } from "@/lib/dev-routes";
import { privateJsonResponse } from "@/lib/secure-response";
import { isProCleanAccountEmail } from "@/lib/pro-clean-account";

export async function POST(request: NextRequest) {
  const { user, error } = await requireSecureAuth(request);
  if (error) return error;

  if (isProCleanAccountEmail(user!.email)) {
    return privateJsonResponse({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const locationId = String(body.locationId || "").trim();

  if (!locationId) {
    return privateJsonResponse({ error: "Location is required" }, { status: 400 });
  }

  if (isProCleanAccountEmail(user!.email) && locationId !== user!.locationId) {
    return privateJsonResponse({ error: "Forbidden" }, { status: 403 });
  }

  if (isProductionRuntime()) {
    if (locationId !== user!.locationId) {
      return privateJsonResponse({ error: "Forbidden" }, { status: 403 });
    }
  } else {
    const exists = await prisma.location.findUnique({
      where: { id: locationId },
      select: { id: true },
    });
    if (!exists) {
      return privateJsonResponse({ error: "Location not found" }, { status: 404 });
    }
  }

  const response = privateJsonResponse({ success: true, locationId });
  await applyAuthCookies(response, { ...user!, locationId });
  response.cookies.set(LOCATION_COOKIE_NAME, locationId, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
  });
  return response;
}
