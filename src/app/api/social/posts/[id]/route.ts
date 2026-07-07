import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/api-auth";
import { getLocationIdFromRequest } from "@/lib/location";
import { tenantNotFoundResponse, tenantWhere } from "@/lib/tenant-resource";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requirePermission(request, "manage_social");
  if (error) return error;

  const { id } = await params;
  const locationId = await getLocationIdFromRequest(request);
  const existing = await prisma.socialPost.findFirst({
    where: tenantWhere(id, locationId),
    select: { id: true },
  });
  if (!existing) {
    return tenantNotFoundResponse();
  }

  await prisma.socialPost.delete({ where: tenantWhere(id, locationId) });
  return NextResponse.json({ success: true });
}
