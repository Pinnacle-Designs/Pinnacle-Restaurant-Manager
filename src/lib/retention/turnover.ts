import { differenceInDays, subMonths } from "date-fns";
import { prisma } from "@/lib/prisma";

export type ShiftBucket = "morning" | "afternoon" | "evening" | "late";

export const SHIFT_BUCKET_LABELS: Record<ShiftBucket, string> = {
  morning: "Morning (before 11 AM)",
  afternoon: "Afternoon (11 AM – 5 PM)",
  evening: "Evening (5 – 10 PM)",
  late: "Late night (after 10 PM)",
};

export function shiftBucket(startTime: string): ShiftBucket {
  const hour = parseInt(startTime.split(":")[0], 10);
  if (hour < 11) return "morning";
  if (hour < 17) return "afternoon";
  if (hour < 22) return "evening";
  return "late";
}

function effectiveHireDate(member: { hireDate: Date | null; createdAt: Date }) {
  return member.hireDate ?? member.createdAt;
}

function effectiveTerminationDate(member: {
  terminatedAt: Date | null;
  active: boolean;
  updatedAt: Date;
}) {
  if (member.terminatedAt) return member.terminatedAt;
  if (!member.active) return member.updatedAt;
  return null;
}

export async function computeTurnoverAnalytics(locationId: string, months = 12) {
  const since = subMonths(new Date(), months);
  const location = await prisma.location.findUnique({
    where: { id: locationId },
    select: { name: true },
  });

  const staff = await prisma.staffMember.findMany({ where: { locationId } });
  const activeStaff = staff.filter((s) => s.active);
  const departed = staff.filter((s) => {
    const term = effectiveTerminationDate(s);
    return term && term >= since;
  });

  const avgHeadcount = Math.max(1, (activeStaff.length + staff.length) / 2);
  const annualizedRate = (departures: number) =>
    Math.round((departures / avgHeadcount) * (12 / months) * 1000) / 10;

  const byRole: Record<string, { active: number; departures: number; rate: number }> = {};
  for (const member of staff) {
    const role = member.role || "Other";
    if (!byRole[role]) byRole[role] = { active: 0, departures: 0, rate: 0 };
    if (member.active) byRole[role].active += 1;
  }
  for (const member of departed) {
    const role = member.role || "Other";
    if (!byRole[role]) byRole[role] = { active: 0, departures: 0, rate: 0 };
    byRole[role].departures += 1;
  }
  for (const role of Object.keys(byRole)) {
    const bucket = byRole[role];
    const denom = Math.max(1, bucket.active + bucket.departures);
    bucket.rate = Math.round((bucket.departures / denom) * 1000) / 10;
  }

  const bucketCounts: Record<ShiftBucket, { departures: number; shiftCount: number }> = {
    morning: { departures: 0, shiftCount: 0 },
    afternoon: { departures: 0, shiftCount: 0 },
    evening: { departures: 0, shiftCount: 0 },
    late: { departures: 0, shiftCount: 0 },
  };

  const lookbackDays = 90;
  for (const member of departed) {
    const term = effectiveTerminationDate(member)!;
    const windowStart = new Date(term);
    windowStart.setDate(windowStart.getDate() - lookbackDays);

    const shifts = await prisma.shift.findMany({
      where: {
        staffMemberId: member.id,
        date: { gte: windowStart, lte: term },
      },
      select: { startTime: true },
    });

    if (shifts.length === 0) {
      bucketCounts.evening.departures += 1;
      continue;
    }

    const counts: Record<ShiftBucket, number> = {
      morning: 0,
      afternoon: 0,
      evening: 0,
      late: 0,
    };
    for (const shift of shifts) {
      const b = shiftBucket(shift.startTime);
      counts[b] += 1;
      bucketCounts[b].shiftCount += 1;
    }
    const dominant = (Object.entries(counts) as [ShiftBucket, number][]).sort(
      (a, b) => b[1] - a[1]
    )[0][0];
    bucketCounts[dominant].departures += 1;
  }

  const byShift = (Object.entries(bucketCounts) as [ShiftBucket, typeof bucketCounts.morning][]).map(
    ([bucket, data]) => ({
      bucket,
      label: SHIFT_BUCKET_LABELS[bucket],
      departures: data.departures,
      shiftCount: data.shiftCount,
      rate:
        data.shiftCount > 0
          ? Math.round((data.departures / Math.max(1, data.shiftCount)) * 1000) / 10
          : 0,
    })
  );

  const recentDepartures = departed
    .map((m) => {
      const term = effectiveTerminationDate(m)!;
      const hire = effectiveHireDate(m);
      return {
        id: m.id,
        name: m.name,
        role: m.role,
        terminatedAt: term.toISOString(),
        tenureDays: differenceInDays(term, hire),
        reason: m.terminationReason,
      };
    })
    .sort((a, b) => b.terminatedAt.localeCompare(a.terminatedAt))
    .slice(0, 10);

  const feedbackCount = await prisma.shiftFeedback.count({
    where: { locationId, createdAt: { gte: since } },
  });
  const shoutOutCount = await prisma.shiftFeedback.count({
    where: { locationId, kind: "SHOUT_OUT", createdAt: { gte: since } },
  });

  return {
    locationName: location?.name ?? "This location",
    periodMonths: months,
    summary: {
      activeStaff: activeStaff.length,
      departures: departed.length,
      turnoverRate: annualizedRate(departed.length),
      avgTenureDays:
        departed.length > 0
          ? Math.round(
              recentDepartures.reduce((s, d) => s + d.tenureDays, 0) / departed.length
            )
          : null,
      feedbackThisPeriod: feedbackCount,
      shoutOutsThisPeriod: shoutOutCount,
    },
    byRole: Object.entries(byRole)
      .map(([role, data]) => ({ role, ...data }))
      .sort((a, b) => b.departures - a.departures),
    byShift: byShift.sort((a, b) => b.departures - a.departures),
    recentDepartures,
    hotspots: identifyHotspots(byRole, byShift),
  };
}

function identifyHotspots(
  byRole: Record<string, { active: number; departures: number; rate: number }>,
  byShift: { bucket: ShiftBucket; label: string; departures: number; rate: number }[]
) {
  const messages: string[] = [];
  const roleEntries = Object.entries(byRole)
    .filter(([, d]) => d.departures >= 1)
    .sort((a, b) => b[1].rate - a[1].rate);
  if (roleEntries[0] && roleEntries[0][1].rate >= 15) {
    messages.push(
      `${roleEntries[0][0]} has ${roleEntries[0][1].departures} departure(s) (${roleEntries[0][1].rate}% of role headcount) — review scheduling, training, or management coverage.`
    );
  }
  const shiftHot = byShift.find((s) => s.departures >= 2);
  if (shiftHot) {
    messages.push(
      `${shiftHot.label} shifts correlate with ${shiftHot.departures} recent departures — consider culture check-ins or lead coverage on those shifts.`
    );
  }
  if (messages.length === 0 && roleEntries.length === 0) {
    messages.push("No turnover hotspots detected in this period. Keep logging shift feedback after each shift.");
  }
  return messages;
}
