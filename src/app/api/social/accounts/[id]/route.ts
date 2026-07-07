import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/api-auth";
import { getLocationIdFromRequest } from "@/lib/location";
import { tenantNotFoundResponse, tenantWhere } from "@/lib/tenant-resource";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requirePermission(request, "manage_social");
  if (error) return error;

  const { id } = await params;
  const locationId = await getLocationIdFromRequest(request);
  const body = await request.json();

  const existing = await prisma.socialAccount.findFirst({
    where: tenantWhere(id, locationId),
    select: { id: true },
  });
  if (!existing) {
    return tenantNotFoundResponse();
  }

  const account = await prisma.socialAccount.update({
    where: tenantWhere(id, locationId),
    data: {
      ...(body.accountName !== undefined && { accountName: body.accountName }),
      ...(body.followers !== undefined && { followers: body.followers }),
      ...(body.connected !== undefined && { connected: body.connected }),
      ...(body.connected === true && { lastSyncedAt: new Date() }),
    },
  });

  return NextResponse.json(account);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requirePermission(request, "manage_social");
  if (error) return error;

  const { id } = await params;
  const locationId = await getLocationIdFromRequest(request);

  const existing = await prisma.socialAccount.findFirst({
    where: tenantWhere(id, locationId),
    select: { id: true },
  });
  if (!existing) {
    return tenantNotFoundResponse();
  }

  await prisma.socialAccount.update({
    where: tenantWhere(id, locationId),
    data: { connected: false },
  });

  return NextResponse.json({ success: true });
}
