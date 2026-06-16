import { subDays } from "date-fns";
import { prisma } from "@/lib/prisma";

/** Minutes after expectedAt before a delivery counts as late (e.g. 9 AM order arriving at lunch). */
const ON_TIME_GRACE_MINUTES = 60;

export interface VendorScorecard {
  vendor: string;
  deliveryCount: number;
  poCount: number;
  fillRatePct: number;
  onTimePct: number;
  substitutionRatePct: number;
  reliabilityGrade: "A" | "B" | "C" | "D" | "F";
  reliabilityScore: number;
  shortShipCount: number;
  lateDeliveryCount: number;
  substitutionCount: number;
  totalLinesReceived: number;
  recentIssues: Array<{ type: string; description: string; date: string }>;
}

function normalizeDesc(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function descriptionsDiffer(ordered: string, received: string) {
  const a = normalizeDesc(ordered);
  const b = normalizeDesc(received);
  if (a === b) return false;
  if (a.includes(b) || b.includes(a)) return false;
  const aWords = a.split(/\s+/).filter((w) => w.length > 3);
  const bWords = b.split(/\s+/).filter((w) => w.length > 3);
  if (aWords.length === 0 || bWords.length === 0) return a !== b;
  const overlap = aWords.filter((w) => bWords.includes(w)).length;
  return overlap / Math.max(aWords.length, bWords.length) < 0.5;
}

function gradeFromScore(score: number): VendorScorecard["reliabilityGrade"] {
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 60) return "D";
  return "F";
}

export function detectSubstitution(orderedDescription: string, receivedDescription: string) {
  return descriptionsDiffer(orderedDescription, receivedDescription);
}

export async function computeVendorScorecards(
  locationId: string,
  days = 90
): Promise<VendorScorecard[]> {
  const since = subDays(new Date(), days);

  const receipts = await prisma.goodsReceipt.findMany({
    where: { locationId, receivedAt: { gte: since } },
    include: {
      lines: { include: { poLine: true } },
      po: { include: { lines: true } },
    },
    orderBy: { receivedAt: "desc" },
  });

  const pos = await prisma.vendorPurchaseOrder.findMany({
    where: {
      locationId,
      submittedAt: { gte: since },
      status: { notIn: ["DRAFT", "CANCELLED"] },
    },
    include: { lines: true, receipts: true },
  });

  type VendorAgg = {
    deliveryCount: number;
    poCount: number;
    lineFills: number[];
    onTimeHits: number;
    onTimeTotal: number;
    substitutionLines: number;
    totalLines: number;
    shortShipCount: number;
    lateDeliveryCount: number;
    recentIssues: VendorScorecard["recentIssues"];
  };

  const byVendor = new Map<string, VendorAgg>();

  const ensure = (vendor: string): VendorAgg => {
    const key = vendor.trim() || "Unknown";
    if (!byVendor.has(key)) {
      byVendor.set(key, {
        deliveryCount: 0,
        poCount: 0,
        lineFills: [],
        onTimeHits: 0,
        onTimeTotal: 0,
        substitutionLines: 0,
        totalLines: 0,
        shortShipCount: 0,
        lateDeliveryCount: 0,
        recentIssues: [],
      });
    }
    return byVendor.get(key)!;
  };

  for (const po of pos) {
    const vendor = po.vendor?.trim() || "Unknown";
    const agg = ensure(vendor);
    agg.poCount += 1;

    for (const line of po.lines) {
      const fillPct = line.qtyOrdered > 0 ? Math.min(line.qtyReceived / line.qtyOrdered, 1) : 1;
      agg.lineFills.push(fillPct);
      if (fillPct < 0.98) {
        agg.shortShipCount += 1;
        if (agg.recentIssues.length < 5) {
          agg.recentIssues.push({
            type: "short_ship",
            description: `${line.description}: received ${line.qtyReceived}/${line.qtyOrdered} ${line.unit}`,
            date: po.submittedAt.toISOString(),
          });
        }
      }
    }
  }

  for (const receipt of receipts) {
    const vendor = receipt.vendor.trim() || "Unknown";
    const agg = ensure(vendor);
    agg.deliveryCount += 1;

    if (receipt.po?.expectedAt) {
      agg.onTimeTotal += 1;
      const graceMs = ON_TIME_GRACE_MINUTES * 60 * 1000;
      const onTime = receipt.receivedAt.getTime() <= receipt.po.expectedAt.getTime() + graceMs;
      if (onTime) {
        agg.onTimeHits += 1;
      } else {
        agg.lateDeliveryCount += 1;
        if (agg.recentIssues.length < 5) {
          const expected = receipt.po.expectedAt.toLocaleString();
          const actual = receipt.receivedAt.toLocaleString();
          agg.recentIssues.push({
            type: "late_delivery",
            description: `Expected ${expected}, arrived ${actual}`,
            date: receipt.receivedAt.toISOString(),
          });
        }
      }
    }

    for (const line of receipt.lines) {
      agg.totalLines += 1;
      const ordered =
        line.orderedDescription ?? line.poLine?.description ?? line.description;
      const isSub =
        line.isSubstitution || (line.poLine ? detectSubstitution(ordered, line.description) : false);
      if (isSub) {
        agg.substitutionLines += 1;
        if (agg.recentIssues.length < 5) {
          agg.recentIssues.push({
            type: "substitution",
            description: `Ordered "${ordered}" — received "${line.description}"`,
            date: receipt.receivedAt.toISOString(),
          });
        }
      }

      if (line.poLine && line.qtyReceived < line.poLine.qtyOrdered * 0.98) {
        const fillPct =
          line.poLine.qtyOrdered > 0 ? line.qtyReceived / line.poLine.qtyOrdered : 1;
        if (fillPct < 0.98 && !agg.recentIssues.some((i) => i.description.includes(line.description))) {
          /* counted at PO level */
        }
      }
    }
  }

  const scorecards: VendorScorecard[] = [];

  for (const [vendor, agg] of byVendor) {
    const fillRatePct =
      agg.lineFills.length > 0
        ? Math.round(
            (agg.lineFills.reduce((s, f) => s + f, 0) / agg.lineFills.length) * 1000
          ) / 10
        : 100;

    const onTimePct =
      agg.onTimeTotal > 0
        ? Math.round((agg.onTimeHits / agg.onTimeTotal) * 1000) / 10
        : 100;

    const substitutionRatePct =
      agg.totalLines > 0
        ? Math.round((agg.substitutionLines / agg.totalLines) * 1000) / 10
        : 0;

    const reliabilityScore = Math.round(
      fillRatePct * 0.45 + onTimePct * 0.35 + (100 - substitutionRatePct) * 0.2
    );

    scorecards.push({
      vendor,
      deliveryCount: agg.deliveryCount,
      poCount: agg.poCount,
      fillRatePct,
      onTimePct,
      substitutionRatePct,
      reliabilityGrade: gradeFromScore(reliabilityScore),
      reliabilityScore,
      shortShipCount: agg.shortShipCount,
      lateDeliveryCount: agg.lateDeliveryCount,
      substitutionCount: agg.substitutionLines,
      totalLinesReceived: agg.totalLines,
      recentIssues: agg.recentIssues.slice(0, 5),
    });
  }

  return scorecards.sort((a, b) => b.reliabilityScore - a.reliabilityScore);
}

export async function getVendorScorecardSummary(locationId: string) {
  const scorecards = await computeVendorScorecards(locationId);
  const worst = [...scorecards].sort((a, b) => a.reliabilityScore - b.reliabilityScore)[0];
  const best = scorecards[0];
  return {
    vendorCount: scorecards.length,
    avgFillRate:
      scorecards.length > 0
        ? Math.round(
            (scorecards.reduce((s, c) => s + c.fillRatePct, 0) / scorecards.length) * 10
          ) / 10
        : 100,
    avgOnTime:
      scorecards.length > 0
        ? Math.round(
            (scorecards.reduce((s, c) => s + c.onTimePct, 0) / scorecards.length) * 10
          ) / 10
        : 100,
    avgSubstitutionRate:
      scorecards.length > 0
        ? Math.round(
            (scorecards.reduce((s, c) => s + c.substitutionRatePct, 0) / scorecards.length) * 10
          ) / 10
        : 0,
    bestVendor: best ?? null,
    worstVendor: worst ?? null,
    scorecards: scorecards.slice(0, 12),
  };
}
