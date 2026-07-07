import type { NextRequest } from "next/server";
import { prepareAuthSession, attachAuthCookies } from "@/lib/auth-cookies";
import { LOCATION_COOKIE_NAME } from "@/lib/location";
import { applyEmbedAuthCookies } from "@/lib/embed-cookies";
import { resolveUserWorkspace } from "@/lib/user-workspace";
import { privateJsonResponse } from "@/lib/secure-response";
import { clearWorkspaceCookieOptions } from "@/lib/workspace-cookie";
import type { SessionUser } from "@/lib/session";
import { ensureProCleanAccount } from "@/lib/pro-clean-account";
import {
  isProCleanAccountEmail,
  PRO_CLEAN_LOGIN_PATH,
} from "@/lib/pro-clean-email";

export { PRO_CLEAN_LOGIN_PATH };

export function proCleanLoginRequiredResponse() {
  return privateJsonResponse(
    {
      error: "Use the Pro clean workspace sign-in page.",
      loginUrl: PRO_CLEAN_LOGIN_PATH,
    },
    { status: 403 }
  );
}

/** Complete sign-in for pro-clean only — isolated workspace, no demo binding. */
export async function completeProCleanLogin({
  request,
  user,
  email,
  forEmbed = false,
}: {
  request: NextRequest;
  user: SessionUser;
  email: string;
  forEmbed?: boolean;
}) {
  if (!isProCleanAccountEmail(email)) {
    throw new Error("Not a Pro clean account");
  }

  let workspace = null;
  let workspaceError: string | undefined;

  try {
    const ensured = await ensureProCleanAccount({ resetPassword: false });
    if (ensured.locationId) {
      user.locationId = ensured.locationId;
    }
    workspace = await resolveUserWorkspace(user);
  } catch (err) {
    console.error("[pro-login] workspace resolution failed:", err);
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
    redirectTo: "/dashboard",
  });

  response.cookies.set(clearWorkspaceCookieOptions());
  response.cookies.set(LOCATION_COOKIE_NAME, "", {
    path: "/",
    maxAge: 0,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
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
