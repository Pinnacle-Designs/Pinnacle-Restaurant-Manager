import { NextRequest, NextResponse } from "next/server";
import type { AppRole } from "@prisma/client";
import { getSessionUserFromRequest } from "./auth";
import { prisma } from "./prisma";
import type { SessionUser } from "./session";
import {
  hasPermission,
  type Permission,
} from "./permissions";
import { userCan } from "./permission-resolve";

import { isDemoAccountEmail, isPlanDemoAccountEmail } from "./demo-email";
import { isProCleanAccountEmail } from "./pro-clean-email";
import { syncProCleanUserLocation } from "./pro-clean-account";

export function unauthorizedResponse() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export function forbiddenResponse() {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

export async function requireAuth(request: NextRequest) {
  const user = await getSessionUserFromRequest(request);
  if (!user) return { user: null, error: unauthorizedResponse() };
  return requireActiveAccount(user);
}

/** Re-check the account is still active in the database (revoked/deactivated sessions). */
export async function requireActiveAccount(user: SessionUser | null) {
  if (!user) {
    return { user: null, error: unauthorizedResponse() };
  }

  const userSelect = {
    id: true,
    email: true,
    name: true,
    role: true,
    locationId: true,
    avatarUrl: true,
    active: true,
    sessionVersion: true,
  } as const;

  let dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: userSelect,
  });

  const isDemoEmail =
    isDemoAccountEmail(user.email) || isPlanDemoAccountEmail(user.email);

  if (!dbUser?.active && isDemoEmail) {
    dbUser = await prisma.user.findFirst({
      where: { email: user.email.toLowerCase(), active: true },
      select: userSelect,
    });
  }

  if (!dbUser?.active) {
    return { user: null, error: unauthorizedResponse() };
  }

  const isDemo =
    isDemoAccountEmail(dbUser.email) || isPlanDemoAccountEmail(dbUser.email);

  if (
    !isDemo &&
    (user.sessionVersion ?? 0) !== (dbUser.sessionVersion ?? 0)
  ) {
    return { user: null, error: unauthorizedResponse() };
  }

  let locationId = dbUser.locationId;
  if (isProCleanAccountEmail(dbUser.email)) {
    locationId = (await syncProCleanUserLocation(dbUser)) ?? locationId;
  }

  return {
    user: {
      ...user,
      id: dbUser.id,
      email: dbUser.email,
      name: dbUser.name,
      role: dbUser.role,
      locationId,
      avatarUrl: dbUser.avatarUrl,
    } satisfies SessionUser,
    error: null,
  };
}

export async function requireSecureAuth(request: NextRequest) {
  return requireAuth(request);
}

async function userHasPermission(
  user: { id: string; role: AppRole; locationId: string | null; permissions?: Permission[] },
  permission: Permission
): Promise<boolean> {
  return userCan(user, permission);
}

export async function requirePermission(request: NextRequest, permission: Permission) {
  const { user, error } = await requireAuth(request);
  if (error) return { user: null, error };
  if (!(await userHasPermission(user!, permission))) {
    return { user: null, error: forbiddenResponse() };
  }
  return { user: user!, error: null };
}

export async function requireAnyPermission(
  request: NextRequest,
  permissions: Permission[]
) {
  const { user, error } = await requireAuth(request);
  if (error) return { user: null, error };
  const allowed = await Promise.all(
    permissions.map((permission) => userHasPermission(user!, permission))
  );
  if (!allowed.some(Boolean)) {
    return { user: null, error: forbiddenResponse() };
  }
  return { user: user!, error: null };
}

export function stripSalaries<T extends { hourlyRate?: number }>(
  role: AppRole,
  items: T[],
  permissions?: Permission[] | null
): T[] {
  const canView =
    permissions?.includes("view_salaries") ?? hasPermission(role, "view_salaries");
  if (canView) return items;
  return items.map((item) => {
    const { hourlyRate: _rate, ...rest } = item;
    void _rate;
    return rest as T;
  });
}
