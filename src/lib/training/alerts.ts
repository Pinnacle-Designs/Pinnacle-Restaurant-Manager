import { differenceInCalendarDays, isBefore } from "date-fns";
import { CERTIFICATION_TYPES, certTypeMeta } from "./catalog";
import type { CertAlertLevel } from "@prisma/client";

export type CertRecord = {
  id: string;
  staffMemberId: string;
  staffName: string;
  staffRole: string;
  certType: string;
  expiresAt: Date | null;
  issuedAt: Date | null;
};

export type TrainingGap = {
  staffMemberId: string;
  staffName: string;
  staffRole: string;
  moduleKey: string;
  moduleTitle: string;
  reason: "never_completed" | "expired";
  expiresAt: Date | null;
};

export type CertificationAlert = {
  id: string;
  staffMemberId: string;
  staffName: string;
  staffRole: string;
  certType: string;
  certLabel: string;
  level: CertAlertLevel;
  expiresAt: Date | null;
  daysUntilExpiry: number | null;
  auditCritical: boolean;
};

export function certAlertLevel(
  expiresAt: Date | null,
  warnDays: number,
  now = new Date()
): CertAlertLevel {
  if (!expiresAt) return "OK";
  if (isBefore(expiresAt, now)) return "EXPIRED";
  const days = differenceInCalendarDays(expiresAt, now);
  if (days <= warnDays) return "EXPIRING";
  return "OK";
}

export function buildCertAlerts(
  certs: CertRecord[],
  staff: { id: string; name: string; role: string; active: boolean }[],
  warnDays: number,
  now = new Date()
): CertificationAlert[] {
  const alerts: CertificationAlert[] = [];
  const certByStaffType = new Map<string, CertRecord>();

  for (const cert of certs) {
    certByStaffType.set(`${cert.staffMemberId}:${cert.certType}`, cert);
    const meta = certTypeMeta(cert.certType);
    const level = certAlertLevel(cert.expiresAt, warnDays, now);
    if (level === "OK") continue;
    alerts.push({
      id: cert.id,
      staffMemberId: cert.staffMemberId,
      staffName: cert.staffName,
      staffRole: cert.staffRole,
      certType: cert.certType,
      certLabel: meta?.label ?? cert.certType,
      level,
      expiresAt: cert.expiresAt,
      daysUntilExpiry: cert.expiresAt
        ? differenceInCalendarDays(cert.expiresAt, now)
        : null,
      auditCritical: meta?.auditCritical ?? false,
    });
  }

  for (const member of staff.filter((s) => s.active)) {
    for (const type of CERTIFICATION_TYPES) {
      if (!type.requiredForRoles.some((r) => member.role.includes(r) || r.includes(member.role))) {
        continue;
      }
      const key = `${member.id}:${type.key}`;
      if (certByStaffType.has(key)) continue;
      alerts.push({
        id: `missing-${member.id}-${type.key}`,
        staffMemberId: member.id,
        staffName: member.name,
        staffRole: member.role,
        certType: type.key,
        certLabel: type.label,
        level: "MISSING",
        expiresAt: null,
        daysUntilExpiry: null,
        auditCritical: type.auditCritical,
      });
    }
  }

  const order: Record<CertAlertLevel, number> = {
    EXPIRED: 0,
    MISSING: 1,
    EXPIRING: 2,
    OK: 3,
  };

  return alerts.sort((a, b) => order[a.level] - order[b.level]);
}

export function buildTrainingGaps(
  modules: { id: string; moduleKey: string; title: string; required: boolean; renewalMonths: number | null }[],
  completions: {
    moduleId: string;
    staffMemberId: string;
    staffName: string;
    staffRole: string;
    expiresAt: Date | null;
    completedAt: Date;
  }[],
  staff: { id: string; name: string; role: string; active: boolean }[],
  now = new Date()
): TrainingGap[] {
  const gaps: TrainingGap[] = [];
  const requiredModules = modules.filter((m) => m.required);

  for (const member of staff.filter((s) => s.active)) {
    for (const mod of requiredModules) {
      const latest = completions
        .filter((c) => c.moduleId === mod.id && c.staffMemberId === member.id)
        .sort((a, b) => b.completedAt.getTime() - a.completedAt.getTime())[0];

      if (!latest) {
        gaps.push({
          staffMemberId: member.id,
          staffName: member.name,
          staffRole: member.role,
          moduleKey: mod.moduleKey,
          moduleTitle: mod.title,
          reason: "never_completed",
          expiresAt: null,
        });
        continue;
      }

      if (latest.expiresAt && isBefore(latest.expiresAt, now)) {
        gaps.push({
          staffMemberId: member.id,
          staffName: member.name,
          staffRole: member.role,
          moduleKey: mod.moduleKey,
          moduleTitle: mod.title,
          reason: "expired",
          expiresAt: latest.expiresAt,
        });
      }
    }
  }

  return gaps;
}
