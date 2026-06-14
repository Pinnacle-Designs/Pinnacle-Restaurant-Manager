import { NextRequest, NextResponse } from "next/server";
import type { AppRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getLocationIdFromRequest } from "@/lib/location";
import { requireAuth } from "@/lib/api-auth";
import {
  canAccessPermissionSettings,
  canManageTargetRole,
} from "@/lib/permission-resolve";
import {
  canManagePermissions,
  sanitizePermissionPayload,
} from "@/lib/permissions-api";
import { serializePermissionList } from "@/lib/permission-utils";
import { ROLE_LABELS } from "@/lib/permissions";

const APP_ROLES: AppRole[] = ["OWNER", "MANAGER", "SERVER", "KITCHEN", "HOST"];

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ role: string }> }
) {
  const { user, error } = await requireAuth(request);
  if (error) return error;

  if (!canAccessPermissionSettings(user!.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const roleParam = (await params).role.toUpperCase();
  if (!APP_ROLES.includes(roleParam as AppRole)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }
  const role = roleParam as AppRole;

  if (role === "OWNER") {
    return NextResponse.json({ error: "Owner access cannot be changed" }, { status: 403 });
  }

  if (!canManagePermissions(user!.role, role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const permissions = sanitizePermissionPayload(body.permissions, user!.role);
  if (!permissions) {
    return NextResponse.json({ error: "Invalid permissions payload" }, { status: 400 });
  }

  const locationId = await getLocationIdFromRequest(request);

  const saved = await prisma.rolePermissionSet.upsert({
    where: { locationId_role: { locationId, role } },
    create: {
      locationId,
      role,
      permissions: serializePermissionList(permissions),
    },
    update: {
      permissions: serializePermissionList(permissions),
    },
    select: { role: true, permissions: true, updatedAt: true },
  });

  return NextResponse.json({
    role: saved.role,
    roleLabel: ROLE_LABELS[saved.role],
    permissions,
    updatedAt: saved.updatedAt.toISOString(),
  });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ role: string }> }
) {
  const { user, error } = await requireAuth(request);
  if (error) return error;

  if (!canAccessPermissionSettings(user!.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const roleParam = (await params).role.toUpperCase();
  if (!APP_ROLES.includes(roleParam as AppRole)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }
  const role = roleParam as AppRole;

  if (!canManageTargetRole(user!.role, role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const locationId = await getLocationIdFromRequest(request);
  await prisma.rolePermissionSet.deleteMany({ where: { locationId, role } });

  return NextResponse.json({ message: `${ROLE_LABELS[role]} permissions reset to defaults` });
}
