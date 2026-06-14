import type { AppRole } from "./app-role";
import { prisma } from "./prisma";
import type { Permission } from "./permissions";
import {
  ALL_PERMISSIONS,
  DEFAULT_ROLE_PERMISSIONS,
} from "./permissions";
import {
  defaultPermissionsForRole,
  ownerPermissions,
  parsePermissionList,
} from "./permission-utils";

export async function getRolePermissionSet(
  locationId: string,
  role: AppRole
): Promise<Permission[] | null> {
  const row = await prisma.rolePermissionSet.findUnique({
    where: { locationId_role: { locationId, role } },
    select: { permissions: true },
  });
  if (!row) return null;
  const parsed = parsePermissionList(row.permissions);
  return parsed.length > 0 ? parsed : null;
}

export async function getUserPermissionOverride(
  userId: string
): Promise<Permission[] | null> {
  const row = await prisma.userPermissionOverride.findUnique({
    where: { userId },
    select: { permissions: true },
  });
  if (!row) return null;
  const parsed = parsePermissionList(row.permissions);
  return parsed.length > 0 ? parsed : null;
}

export async function resolveEffectivePermissions(
  role: AppRole,
  locationId: string | null | undefined,
  userId: string
): Promise<Permission[]> {
  if (role === "OWNER") return ownerPermissions();

  if (!locationId) {
    return [...(DEFAULT_ROLE_PERMISSIONS[role] ?? [])];
  }

  const [userOverride, roleSet] = await Promise.all([
    getUserPermissionOverride(userId),
    getRolePermissionSet(locationId, role),
  ]);

  if (userOverride) return userOverride;
  if (roleSet) return roleSet;
  return defaultPermissionsForRole(role);
}

export function hasResolvedPermission(
  permissions: Permission[],
  permission: Permission
): boolean {
  return permissions.includes(permission);
}

export async function userCan(
  user: { id: string; role: AppRole; locationId: string | null; permissions?: Permission[] },
  permission: Permission
): Promise<boolean> {
  const permissions =
    user.permissions?.length
      ? user.permissions
      : await resolveEffectivePermissions(user.role, user.locationId, user.id);
  return hasResolvedPermission(permissions, permission);
}

export function canManageTargetRole(actorRole: AppRole, targetRole: AppRole): boolean {
  if (actorRole === "OWNER") return targetRole !== "OWNER";
  if (actorRole === "MANAGER") return targetRole !== "OWNER";
  return false;
}

export function canManageTargetUser(
  actorRole: AppRole,
  targetRole: AppRole
): boolean {
  if (targetRole === "OWNER") return false;
  return actorRole === "OWNER" || actorRole === "MANAGER";
}

export function canAccessPermissionSettings(role: AppRole): boolean {
  return role === "OWNER" || role === "MANAGER";
}

export const EDITABLE_ROLES: AppRole[] = ["MANAGER", "SERVER", "KITCHEN", "HOST"];

export function editableRolesFor(actorRole: AppRole): AppRole[] {
  if (!canAccessPermissionSettings(actorRole)) return [];
  return EDITABLE_ROLES;
}

export function assignablePermissions(): Permission[] {
  return ALL_PERMISSIONS.filter((p) => p !== "manage_permissions");
}
