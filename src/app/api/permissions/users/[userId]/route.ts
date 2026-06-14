import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getLocationIdFromRequest } from "@/lib/location";
import { requireAuth } from "@/lib/api-auth";
import {
  canAccessPermissionSettings,
  canManageTargetUser,
  resolveEffectivePermissions,
} from "@/lib/permission-resolve";
import { sanitizePermissionPayload } from "@/lib/permissions-api";
import { serializePermissionList } from "@/lib/permission-utils";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const { user, error } = await requireAuth(request);
  if (error) return error;

  if (!canAccessPermissionSettings(user!.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { userId } = await params;
  const locationId = await getLocationIdFromRequest(request);

  const target = await prisma.user.findFirst({
    where: { id: userId, locationId, active: true },
    select: { id: true, role: true, name: true },
  });

  if (!target) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  if (!canManageTargetUser(user!.role, target.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const permissions = sanitizePermissionPayload(body.permissions, user!.role);
  if (!permissions) {
    return NextResponse.json({ error: "Invalid permissions payload" }, { status: 400 });
  }

  const saved = await prisma.userPermissionOverride.upsert({
    where: { userId: target.id },
    create: {
      locationId,
      userId: target.id,
      permissions: serializePermissionList(permissions),
    },
    update: {
      permissions: serializePermissionList(permissions),
    },
    select: { userId: true, permissions: true, updatedAt: true },
  });

  const effective = await resolveEffectivePermissions(target.role, locationId, target.id);

  return NextResponse.json({
    userId: saved.userId,
    permissions,
    effectivePermissions: effective,
    updatedAt: saved.updatedAt.toISOString(),
  });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const { user, error } = await requireAuth(_request);
  if (error) return error;

  if (!canAccessPermissionSettings(user!.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { userId } = await params;
  const locationId = await getLocationIdFromRequest(_request);

  const target = await prisma.user.findFirst({
    where: { id: userId, locationId, active: true },
    select: { id: true, role: true },
  });

  if (!target) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  if (!canManageTargetUser(user!.role, target.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await prisma.userPermissionOverride.deleteMany({ where: { userId: target.id } });

  const effective = await resolveEffectivePermissions(target.role, locationId, target.id);

  return NextResponse.json({
    userId: target.id,
    effectivePermissions: effective,
    message: "Individual override removed — using role permissions",
  });
}
