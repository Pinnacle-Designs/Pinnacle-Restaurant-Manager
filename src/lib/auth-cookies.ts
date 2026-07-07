import type { NextResponse } from "next/server";
import { enrichUserWithPlan } from "./location-plan";
import { createSessionToken, sessionCookieOptions, type SessionUser } from "./session";
import { API_SESSION_COOKIE_NAME, EMBED_API_COOKIE_NAME } from "./embed-constants";
import { AUTH_COOKIE_MAX_AGE } from "./session";
import {
  createWorkspaceCookieToken,
  workspaceCookieOptions,
} from "./workspace-cookie";
import { buildWorkspaceSnapshot } from "./workspace-snapshot";
import { getSessionVersion } from "./session-version";
import { syncProCleanUserLocation } from "./pro-clean-account";
import { isProCleanAccountEmail } from "./pro-clean-email";

export interface PreparedAuthSession {
  sessionUser: SessionUser;
  sessionToken: string;
  workspaceToken: string | null;
}

export async function prepareAuthSession(user: SessionUser): Promise<PreparedAuthSession> {
  let baseUser = user;
  if (isProCleanAccountEmail(user.email)) {
    const locationId = await syncProCleanUserLocation(user);
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
  const forEmbed = options?.forEmbed ?? false;
  const secure = options?.secure ?? process.env.NODE_ENV === "production";

  response.cookies.set(sessionCookieOptions(prepared.sessionToken, forEmbed, options?.secure));
  response.cookies.set({
    name: API_SESSION_COOKIE_NAME,
    value: prepared.sessionToken,
    httpOnly: false,
    secure: forEmbed ? (options?.secure ?? true) : secure,
    sameSite: forEmbed ? "none" : "lax",
    path: "/",
    maxAge: AUTH_COOKIE_MAX_AGE,
    ...(forEmbed ? { partitioned: true } : {}),
  });
  if (forEmbed) {
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
  } else {
    response.cookies.set({
      name: EMBED_API_COOKIE_NAME,
      value: "",
      path: "/",
      maxAge: 0,
      httpOnly: false,
      sameSite: "lax",
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
