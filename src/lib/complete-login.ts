import type { NextRequest } from "next/server";
import type { NextResponse } from "next/server";
import { clearSessionCookieOptions } from "@/lib/auth";
import { prepareAuthSession, attachAuthCookies } from "@/lib/auth-cookies";
import { LOCATION_COOKIE_NAME } from "@/lib/location";
import { applyEmbedAuthCookies } from "@/lib/embed-cookies";
import { setupDemoWorkspace } from "@/lib/seed-data";
import {
  ensureOwnerDemoPostCheckout,
  ownerDemoPostCheckoutRedirect,
} from "@/lib/demo-owner-billing";
import { resolveUserWorkspace } from "@/lib/user-workspace";
import { prisma } from "@/lib/prisma";
import { devDemoLoginEnabled, isDemoAccountEmail, OWNER_DEMO_EMAIL } from "@/lib/demo-users";
import type { SessionUser } from "@/lib/session";
import { privateJsonResponse } from "@/lib/secure-response";
import { clearWorkspaceCookieOptions } from "@/lib/workspace-cookie";
import {
  ensureProCleanAccount,
  isProCleanAccountEmail,
} from "@/lib/pro-clean-account";

interface CompleteLoginOptions {
  request: NextRequest;
  user: SessionUser;
  email: string;
  forEmbed?: boolean;
}

export async function completeUserLogin({
  request,
  user,
  email,
  forEmbed = false,
}: CompleteLoginOptions) {
  let workspace = null;
  let workspaceError: string | undefined;
  let redirectTo: string | undefined;

  try {
    if (isProCleanAccountEmail(email)) {
      const ensured = await ensureProCleanAccount({ resetPassword: false });
      if (ensured.locationId) {
        user.locationId = ensured.locationId;
      }
    } else if (devDemoLoginEnabled() && isDemoAccountEmail(email)) {
      workspace = await setupDemoWorkspace("seeded");
      await prisma.user.update({
        where: { id: user.id },
        data: { locationId: workspace.locationId },
      });
      user.locationId = workspace.locationId;
      if (email === OWNER_DEMO_EMAIL) {
        await ensureOwnerDemoPostCheckout(workspace.locationId, user.id);
        redirectTo = ownerDemoPostCheckoutRedirect(email) ?? undefined;
      }
    } else {
      workspace = await resolveUserWorkspace(user);
    }
  } catch (err) {
    console.error("User workspace resolution failed:", err);
    workspaceError = err instanceof Error ? err.message : "Could not open your workspace";
  }

  const locationId = workspace?.locationId ?? user.locationId;
  const prepared = await prepareAuthSession({
    ...user,
    locationId,
  });

  const response = privateJsonResponse({
    user: prepared.sessionUser,
    workspace,
    workspaceError,
    redirectTo,
  });

  if (forEmbed) {
    if (locationId) {
      applyEmbedAuthCookies(response, request, prepared.sessionToken, locationId, true);
      attachAuthCookies(response, prepared, { forEmbed: true, secure: true });
    } else {
      attachAuthCookies(response, prepared, { forEmbed: true, secure: true });
    }
  } else {
    attachAuthCookies(response, prepared);
    if (locationId) {
      response.cookies.set(LOCATION_COOKIE_NAME, locationId, {
        path: "/",
        maxAge: 60 * 60 * 24 * 365,
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
      });
    }
  }

  return response;
}

export function attachLogoutCookies(response: NextResponse) {
  response.cookies.set(clearSessionCookieOptions());
  response.cookies.set(LOCATION_COOKIE_NAME, "", {
    path: "/",
    maxAge: 0,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
  });
  response.cookies.set(clearWorkspaceCookieOptions());
}
