import type { NextResponse } from "next/server";
import { enrichUserWithPlan } from "./location-plan";
import { createSessionToken, sessionCookieOptions, type SessionUser } from "./session";
import { EMBED_API_COOKIE_NAME } from "./embed-constants";
import { AUTH_COOKIE_MAX_AGE } from "./session";
import {
  createWorkspaceCookieToken,
  workspaceCookieOptions,
} from "./workspace-cookie";
import { buildWorkspaceSnapshot } from "./workspace-snapshot";
import { getSessionVersion } from "./session-version";
import { isProCleanAccountEmail } from "./pro-clean-email";
import { resolveProCleanLocationId } from "./pro-clean-account";

export interface PreparedAuthSession {
  sessionUser: SessionUser;
  sessionToken: string;
  workspaceToken: string | null;
}

export async function prepareAuthSession(user: SessionUser): Promise<PreparedAuthSession> {
  let baseUser = user;
  if (isProCleanAccountEmail(user.email)) {
    const locationId = await resolveProCleanLocationId(user);
    if (locationId) {
      baseUser = { ...user, locationId };
    }
  }

  const sessionUser = await enrichUserWithPlan(baseUser);
  const sessionVersion = await getSessionVersion(sessionUser.id);
  const withVersion = { ...sessionUser, sessionVersion };
  const sessionToken = await createSessionToken(withVersion);
  let workspaceToken: string | null = null;

  if (sessionUser.locationId) {
    const snapshot = await buildWorkspaceSnapshot(sessionUser.locationId);
    if (snapshot) {
      workspaceToken = await createWorkspaceCookieToken(snapshot);
    }
  }

  return { sessionUser, sessionToken, workspaceToken };
}

export function attachAuthCookies(
  response: NextResponse,
  prepared: PreparedAuthSession,
  options?: { forEmbed?: boolean; secure?: boolean }
) {
  response.cookies.set(
    sessionCookieOptions(prepared.sessionToken, options?.forEmbed ?? false, options?.secure)
  );
  if (options?.forEmbed) {
    response.cookies.set({
      name: EMBED_API_COOKIE_NAME,
      value: prepared.sessionToken,
      httpOnly: false,
      secure: options?.secure ?? true,
      sameSite: "none",
      path: "/",
      maxAge: AUTH_COOKIE_MAX_AGE,
      partitioned: true,
    });
  }
  if (prepared.workspaceToken) {
    response.cookies.set(workspaceCookieOptions(prepared.workspaceToken, options?.secure));
  }
}

/** Refresh session + workspace cookies on an existing response. */
export async function applyAuthCookies(
  response: NextResponse,
  user: SessionUser,
  options?: { forEmbed?: boolean; secure?: boolean }
): Promise<SessionUser> {
  const prepared = await prepareAuthSession(user);
  attachAuthCookies(response, prepared, options);
  return prepared.sessionUser;
}
