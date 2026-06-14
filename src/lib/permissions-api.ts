import { NextRequest, NextResponse } from "next/server";
import type { AppRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getLocationIdFromRequest } from "@/lib/location";
import { requireAuth } from "@/lib/api-auth";
import {
  ALL_PERMISSIONS,
  DEFAULT_ROLE_PERMISSIONS,
  PERMISSION_GROUPS,
  PERMISSION_LABELS,
  ROLE_LABELS,
  type Permission,
} from "@/lib/permissions";
import {
  assignablePermissions,
  canAccessPermissionSettings,
  canManageTargetRole,
  canManageTargetUser,
  editableRolesFor,
  getRolePermissionSet,
  getUserPermissionOverride,
  resolveEffectivePermissions,
} from "@/lib/permission-resolve";
import { defaultPermissionsForRole } from "@/lib/permission-utils";

export async function GET(request: NextRequest) {
  const { user, error } = await requireAuth(request);
  if (error) return error;

  if (!canAccessPermissionSettings(user!.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const locationId = await getLocationIdFromRequest(request);
  const editableRoles = editableRolesFor(user!.role);

  const [roleSets, overrides, members] = await Promise.all([
    prisma.rolePermissionSet.findMany({
      where: { locationId, role: { in: editableRoles } },
      select: { role: true, permissions: true, updatedAt: true },
    }),
    prisma.userPermissionOverride.findMany({
      where: { locationId },
      select: { userId: true, permissions: true, updatedAt: true },
    }),
    prisma.user.findMany({
      where: { locationId, active: true },
      select: { id: true, name: true, email: true, role: true },
      orderBy: [{ role: "asc" }, { name: "asc" }],
    }),
  ]);

  const rolePermissionEntries = await Promise.all(
    editableRoles.map(async (role) => {
      const custom = await getRolePermissionSet(locationId, role);
      return [
        role,
        {
          permissions: custom ?? defaultPermissionsForRole(role),
          customized: roleSets.some((row) => row.role === role),
          defaults: DEFAULT_ROLE_PERMISSIONS[role],
        },
      ] as const;
    })
  );

  const rolePermissions = Object.fromEntries(rolePermissionEntries) as Record<
    AppRole,
    { permissions: Permission[]; customized: boolean; defaults: Permission[] }
  >;

  const users = await Promise.all(
    members
      .filter((member) => canManageTargetUser(user!.role, member.role) || member.id === user!.id)
      .map(async (member) => {
        const override = await getUserPermissionOverride(member.id);
        const effective = await resolveEffectivePermissions(
          member.role,
          locationId,
          member.id
        );
        return {
          id: member.id,
          name: member.name,
          email: member.email,
          role: member.role,
          roleLabel: ROLE_LABELS[member.role],
          editable: canManageTargetUser(user!.role, member.role),
          hasOverride: Boolean(override),
          overridePermissions: override,
          effectivePermissions: effective,
          rolePermissions:
            (await getRolePermissionSet(locationId, member.role)) ??
            defaultPermissionsForRole(member.role),
        };
      })
  );

  return NextResponse.json({
    actorRole: user!.role,
    editableRoles,
    canEditOwner: false,
    rolePermissions,
    users,
    permissionCatalog: {
      all: ALL_PERMISSIONS,
      assignable: assignablePermissions(),
      labels: PERMISSION_LABELS,
      groups: PERMISSION_GROUPS,
    },
    overrides: overrides.map((row) => ({
      userId: row.userId,
      permissions: row.permissions,
      updatedAt: row.updatedAt.toISOString(),
    })),
  });
}

export function sanitizePermissionPayload(
  raw: unknown,
  actorRole: AppRole
): Permission[] | null {
  if (!Array.isArray(raw)) return null;
  const allowed = new Set(assignablePermissions());
  if (actorRole === "OWNER") {
    allowed.add("manage_permissions");
  }
  const parsed = raw.filter(
    (item): item is Permission =>
      typeof item === "string" && allowed.has(item as Permission)
  );
  return [...new Set(parsed)];
}

export function canManagePermissions(actorRole: AppRole, targetRole: AppRole): boolean {
  return canManageTargetRole(actorRole, targetRole);
}
