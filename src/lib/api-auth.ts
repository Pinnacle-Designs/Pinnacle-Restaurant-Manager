import { NextRequest, NextResponse } from "next/server";
import type { AppRole } from "@prisma/client";
import { getSessionUserFromRequest } from "./auth";
import {
  hasPermission,
  type Permission,
} from "./permissions";
import { userCan } from "./permission-resolve";

export function unauthorizedResponse() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export function forbiddenResponse() {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

export async function requireAuth(request: NextRequest) {
  const user = await getSessionUserFromRequest(request);
  if (!user) return { user: null, error: unauthorizedResponse() };
  return { user, error: null };
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
