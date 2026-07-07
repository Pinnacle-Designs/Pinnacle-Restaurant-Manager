import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getLocationIdFromRequest } from "@/lib/location";
import { requirePermission } from "@/lib/api-auth";
import { tenantWhere } from "@/lib/tenant-resource";

type RouteParams = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { error } = await requirePermission(request, "manage_training");
  if (error) return error;

  const { id } = await params;
  const locationId = await getLocationIdFromRequest(request);
  const body = await request.json();

  const existing = await prisma.staffCertification.findFirst({
    where: { id, locationId },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const cert = await prisma.staffCertification.update({
    where: tenantWhere(id, locationId),
    data: {
      issuer: body.issuer !== undefined ? body.issuer?.trim() || null : undefined,
      certificateNumber:
        body.certificateNumber !== undefined ? body.certificateNumber?.trim() || null : undefined,
      issuedAt: body.issuedAt ? new Date(body.issuedAt) : undefined,
      expiresAt: body.expiresAt !== undefined ? (body.expiresAt ? new Date(body.expiresAt) : null) : undefined,
      notes: body.notes !== undefined ? body.notes?.trim() || null : undefined,
    },
    include: { staffMember: { select: { name: true, role: true } } },
  });

  return NextResponse.json({
    ...cert,
    issuedAt: cert.issuedAt?.toISOString() ?? null,
    expiresAt: cert.expiresAt?.toISOString() ?? null,
    createdAt: cert.createdAt.toISOString(),
    updatedAt: cert.updatedAt.toISOString(),
  });
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { error } = await requirePermission(request, "manage_training");
  if (error) return error;

  const { id } = await params;
  const locationId = await getLocationIdFromRequest(request);

  const existing = await prisma.staffCertification.findFirst({
    where: { id, locationId },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.staffCertification.delete({ where: tenantWhere(id, locationId) });
  return NextResponse.json({ ok: true });
}
