import type { AppRole } from "./app-role";
import type { Permission } from "./permissions";
import {
  ALL_PERMISSIONS,
  DEFAULT_ROLE_PERMISSIONS,
  isValidPermission,
} from "./permissions";

export function parsePermissionList(raw: string | null | undefined): Permission[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is Permission => isValidPermission(item));
  } catch {
    return [];
  }
}

export function serializePermissionList(permissions: Permission[]): string {
  return JSON.stringify([...new Set(permissions)]);
}

export function ownerPermissions(): Permission[] {
  return [...ALL_PERMISSIONS];
}

export function defaultPermissionsForRole(role: AppRole): Permission[] {
  return [...(DEFAULT_ROLE_PERMISSIONS[role] ?? [])];
}

export function mergeUniquePermissions(...lists: Permission[][]): Permission[] {
  return [...new Set(lists.flat())];
}
