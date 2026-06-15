import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getLocationIdFromRequest } from "@/lib/location";
import { requireAuth } from "@/lib/api-auth";
import { resolveStaffMemberForUser } from "@/lib/staff-resolve";
import { ensureDefaultTrainingModules, getOrCreateTrainingSettings } from "@/lib/training/seed-modules";
import { certAlertLevel } from "@/lib/training/alerts";
import { certTypeLabel } from "@/lib/training/catalog";

export async function GET(request: NextRequest) {
  const { user, error } = await requireAuth(request);
  if (error) return error;

  const locationId = await getLocationIdFromRequest(request);
  await ensureDefaultTrainingModules(locationId);
  const settings = await getOrCreateTrainingSettings(locationId);

  const staffMember = await resolveStaffMemberForUser(user!, locationId);
  if (!staffMember) {
    return NextResponse.json({ error: "No staff profile linked to your account" }, { status: 403 });
  }

  const [certifications, modules, completions] = await Promise.all([
    prisma.staffCertification.findMany({
      where: { locationId, staffMemberId: staffMember.id },
      orderBy: { expiresAt: "asc" },
    }),
    prisma.trainingModule.findMany({
      where: { locationId, active: true },
      orderBy: { title: "asc" },
    }),
    prisma.trainingCompletion.findMany({
      where: { locationId, staffMemberId: staffMember.id },
      include: { module: true },
      orderBy: { completedAt: "desc" },
    }),
  ]);

  const myModules = modules.map((mod) => {
    const latest = completions
      .filter((c) => c.moduleId === mod.id)
      .sort((a, b) => b.completedAt.getTime() - a.completedAt.getTime())[0];
    const expired =
      latest?.expiresAt != null && latest.expiresAt.getTime() < Date.now();
    return {
      id: mod.id,
      moduleKey: mod.moduleKey,
      title: mod.title,
      kind: mod.kind,
      summary: mod.summary,
      estimatedMinutes: mod.estimatedMinutes,
      required: mod.required,
      completed: !!latest && !expired,
      completedAt: latest?.completedAt.toISOString() ?? null,
      expiresAt: latest?.expiresAt?.toISOString() ?? null,
      needsRenewal: mod.required && (!latest || expired),
    };
  });

  const myCerts = certifications.map((c) => ({
    id: c.id,
    certType: c.certType,
    certLabel: certTypeLabel(c.certType),
    issuer: c.issuer,
    certificateNumber: c.certificateNumber,
    issuedAt: c.issuedAt?.toISOString() ?? null,
    expiresAt: c.expiresAt?.toISOString() ?? null,
    level: certAlertLevel(c.expiresAt, settings.expirationWarnDays),
  }));

  return NextResponse.json({
    staffMember: { id: staffMember.id, name: staffMember.name, role: staffMember.role },
    certifications: myCerts,
    modules: myModules,
    pendingModules: myModules.filter((m) => m.needsRenewal),
  });
}
