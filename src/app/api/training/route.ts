import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getLocationIdFromRequest } from "@/lib/location";
import { requirePermission } from "@/lib/api-auth";
import { ensureDefaultTrainingModules, getOrCreateTrainingSettings } from "@/lib/training/seed-modules";
import { buildCertAlerts, buildTrainingGaps } from "@/lib/training/alerts";
import { CERTIFICATION_TYPES } from "@/lib/training/catalog";

export async function GET(request: NextRequest) {
  const { error } = await requirePermission(request, "manage_training");
  if (error) return error;

  const locationId = await getLocationIdFromRequest(request);
  await ensureDefaultTrainingModules(locationId);
  const settings = await getOrCreateTrainingSettings(locationId);

  const [staff, certifications, modules, completions] = await Promise.all([
    prisma.staffMember.findMany({
      where: { locationId, active: true },
      orderBy: { name: "asc" },
    }),
    prisma.staffCertification.findMany({
      where: { locationId },
      include: { staffMember: { select: { name: true, role: true } } },
      orderBy: { expiresAt: "asc" },
    }),
    prisma.trainingModule.findMany({
      where: { locationId, active: true },
      orderBy: { title: "asc" },
    }),
    prisma.trainingCompletion.findMany({
      where: { locationId },
      include: {
        staffMember: { select: { name: true, role: true } },
        module: { select: { moduleKey: true, title: true } },
      },
      orderBy: { completedAt: "desc" },
    }),
  ]);

  const certRecords = certifications.map((c) => ({
    id: c.id,
    staffMemberId: c.staffMemberId,
    staffName: c.staffMember.name,
    staffRole: c.staffMember.role,
    certType: c.certType,
    expiresAt: c.expiresAt,
    issuedAt: c.issuedAt,
  }));

  const alerts = buildCertAlerts(certRecords, staff, settings.expirationWarnDays);
  const trainingGaps = buildTrainingGaps(
    modules,
    completions.map((c) => ({
      moduleId: c.moduleId,
      staffMemberId: c.staffMemberId,
      staffName: c.staffMember.name,
      staffRole: c.staffMember.role,
      expiresAt: c.expiresAt,
      completedAt: c.completedAt,
    })),
    staff
  );

  return NextResponse.json({
    settings: {
      expirationWarnDays: settings.expirationWarnDays,
    },
    certTypes: CERTIFICATION_TYPES,
    alerts,
    trainingGaps,
    certifications: certifications.map((c) => ({
      ...c,
      issuedAt: c.issuedAt?.toISOString() ?? null,
      expiresAt: c.expiresAt?.toISOString() ?? null,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
    })),
    modules: modules.map((m) => ({
      ...m,
      createdAt: m.createdAt.toISOString(),
      updatedAt: m.updatedAt.toISOString(),
    })),
    completions: completions.map((c) => ({
      id: c.id,
      moduleId: c.moduleId,
      moduleKey: c.module.moduleKey,
      moduleTitle: c.module.title,
      staffMemberId: c.staffMemberId,
      staffName: c.staffMember.name,
      completedAt: c.completedAt.toISOString(),
      expiresAt: c.expiresAt?.toISOString() ?? null,
      score: c.score,
      signatureName: c.signatureName,
    })),
    staff: staff.map((s) => ({ id: s.id, name: s.name, role: s.role })),
    summary: {
      expiredCerts: alerts.filter((a) => a.level === "EXPIRED").length,
      expiringCerts: alerts.filter((a) => a.level === "EXPIRING").length,
      missingCerts: alerts.filter((a) => a.level === "MISSING").length,
      trainingGaps: trainingGaps.length,
    },
  });
}

export async function PATCH(request: NextRequest) {
  const { error } = await requirePermission(request, "manage_training");
  if (error) return error;

  const locationId = await getLocationIdFromRequest(request);
  const body = await request.json();

  const settings = await prisma.trainingSettings.upsert({
    where: { locationId },
    create: {
      locationId,
      expirationWarnDays: Number(body.expirationWarnDays) || 30,
    },
    update: {
      expirationWarnDays: Number(body.expirationWarnDays) || 30,
    },
  });

  return NextResponse.json({
    expirationWarnDays: settings.expirationWarnDays,
  });
}
