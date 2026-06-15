import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getLocationIdFromRequest } from "@/lib/location";
import { requirePermission } from "@/lib/api-auth";
import { certTypeMeta } from "@/lib/training/catalog";
import { addMonths } from "date-fns";

export async function POST(request: NextRequest) {
  const { error } = await requirePermission(request, "manage_training");
  if (error) return error;

  const locationId = await getLocationIdFromRequest(request);
  const body = await request.json();

  const staffMemberId = String(body.staffMemberId || "");
  const certType = String(body.certType || "");
  if (!staffMemberId || !certType) {
    return NextResponse.json({ error: "Staff and certification type required" }, { status: 400 });
  }

  const staff = await prisma.staffMember.findFirst({
    where: { id: staffMemberId, locationId },
  });
  if (!staff) {
    return NextResponse.json({ error: "Staff member not found" }, { status: 404 });
  }

  const issuedAt = body.issuedAt ? new Date(body.issuedAt) : new Date();
  let expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;
  if (!expiresAt) {
    const meta = certTypeMeta(certType);
    if (meta?.defaultValidityMonths) {
      expiresAt = addMonths(issuedAt, meta.defaultValidityMonths);
    }
  }

  const cert = await prisma.staffCertification.create({
    data: {
      locationId,
      staffMemberId,
      certType,
      issuer: body.issuer?.trim() || null,
      certificateNumber: body.certificateNumber?.trim() || null,
      issuedAt,
      expiresAt,
      notes: body.notes?.trim() || null,
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
