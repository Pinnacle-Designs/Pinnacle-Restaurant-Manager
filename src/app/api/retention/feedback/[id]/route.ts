import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getLocationIdFromRequest } from "@/lib/location";
import { requirePermission } from "@/lib/api-auth";
import { tenantWhere } from "@/lib/tenant-resource";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requirePermission(request, "manage_retention");
  if (error) return error;

  const locationId = await getLocationIdFromRequest(request);
  const { id } = await params;

  const existing = await prisma.shiftFeedback.findFirst({
    where: { id, locationId },
  });
  if (!existing) {
    return NextResponse.json({ error: "Feedback not found." }, { status: 404 });
  }

  await prisma.shiftFeedback.delete({ where: tenantWhere(id, locationId) });
  return NextResponse.json({ success: true });
}
