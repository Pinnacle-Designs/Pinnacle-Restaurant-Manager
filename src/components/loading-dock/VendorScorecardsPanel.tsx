"use client";

import { Loader2, TrendingUp, Clock, RefreshCw, Star } from "lucide-react";
import { Badge } from "@/components/ui";

export interface VendorScorecardRow {
  vendor: string;
  deliveryCount: number;
  poCount: number;
  fillRatePct: number;
  onTimePct: number;
  substitutionRatePct: number;
  reliabilityGrade: string;
  reliabilityScore: number;
  shortShipCount: number;
  lateDeliveryCount: number;
  substitutionCount: number;
  recentIssues: Array<{ type: string; description: string; date: string }>;
}

const GRADE_COLORS: Record<string, string> = {
  A: "bg-green-100 text-green-800",
  B: "bg-emerald-100 text-emerald-800",
  C: "bg-amber-100 text-amber-800",
  D: "bg-orange-100 text-orange-800",
  F: "bg-red-100 text-red-800",
};

function MetricBar({ value, label, warnBelow }: { value: number; label: string; warnBelow?: number }) {
  const low = warnBelow != null && value < warnBelow;
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs">
        <span className="text-slate-500">{label}</span>
        <span className={low ? "font-medium text-amber-700" : "font-medium text-slate-700"}>{value}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
        <div
          className={`h-full rounded-full ${low ? "bg-amber-500" : "bg-emerald-500"}`}
          style={{ width: `${Math.min(100, value)}%` }}
        />
      </div>
    </div>
  );
}

export function VendorScorecardsPanel({
  scorecards,
  summary,
  loading,
}: {
  scorecards: VendorScorecardRow[];
  summary: {
    avgFillRate: number;
    avgOnTime: number;
    avgSubstitutionRate: number;
    vendorCount: number;
  } | null;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="card border-sky-100 bg-sky-50/40">
        <div className="flex flex-wrap items-start gap-4">
          <Star className="h-10 w-10 shrink-0 text-sky-600" />
          <div className="flex-1">
            <h2 className="font-semibold text-slate-900">Vendor scorecards</h2>
            <p className="mt-1 text-sm text-slate-600">
              Reliability tracked over 90 days — <strong>fill rate</strong>, <strong>on-time delivery</strong>, and{" "}
              <strong>substitution frequency</strong> give you leverage at contract renewal.
            </p>
            {summary && summary.vendorCount > 0 && (
              <p className="mt-2 text-sm text-slate-700">
                Network avg: {summary.avgFillRate}% fill · {summary.avgOnTime}% on-time ·{" "}
                {summary.avgSubstitutionRate}% substitutions
              </p>
            )}
          </div>
        </div>
      </div>

      {scorecards.length === 0 ? (
        <div className="card py-10 text-center text-slate-500">
          Receive purchase orders to build vendor scorecards — metrics appear after delivery history accumulates.
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {scorecards.map((sc) => (
            <div key={sc.vendor} className="card">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-semibold text-slate-900">{sc.vendor}</h3>
                <div className="flex items-center gap-2">
                  <Badge className={GRADE_COLORS[sc.reliabilityGrade] ?? "bg-slate-100"}>
                    Grade {sc.reliabilityGrade}
                  </Badge>
                  <span className="text-sm text-slate-500">{sc.reliabilityScore}/100</span>
                </div>
              </div>

              <div className="mb-4 space-y-3">
                <MetricBar value={sc.fillRatePct} label="Fill rate — everything ordered delivered?" warnBelow={95} />
                <MetricBar value={sc.onTimePct} label="On-time % — before lunch rush?" warnBelow={85} />
                <MetricBar
                  value={100 - sc.substitutionRatePct}
                  label="Brand match — no silent swaps"
                  warnBelow={90}
                />
              </div>

              <dl className="grid grid-cols-3 gap-2 text-center text-xs">
                <div className="rounded-lg bg-slate-50 p-2">
                  <dt className="text-slate-500">Deliveries</dt>
                  <dd className="font-semibold">{sc.deliveryCount}</dd>
                </div>
                <div className="rounded-lg bg-slate-50 p-2">
                  <dt className="text-slate-500">Short-ships</dt>
                  <dd className={`font-semibold ${sc.shortShipCount > 0 ? "text-amber-700" : ""}`}>
                    {sc.shortShipCount}
                  </dd>
                </div>
                <div className="rounded-lg bg-slate-50 p-2">
                  <dt className="text-slate-500">Substitutions</dt>
                  <dd className={`font-semibold ${sc.substitutionCount > 0 ? "text-red-700" : ""}`}>
                    {sc.substitutionCount}
                  </dd>
                </div>
              </dl>

              {sc.recentIssues.length > 0 && (
                <ul className="mt-4 space-y-1 border-t border-slate-100 pt-3 text-xs text-slate-600">
                  {sc.recentIssues.slice(0, 3).map((issue, i) => (
                    <li key={i} className="flex items-start gap-2">
                      {issue.type === "late_delivery" ? (
                        <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
                      ) : issue.type === "substitution" ? (
                        <RefreshCw className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-600" />
                      ) : (
                        <TrendingUp className="mt-0.5 h-3.5 w-3.5 shrink-0 text-orange-600" />
                      )}
                      <span>{issue.description}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
