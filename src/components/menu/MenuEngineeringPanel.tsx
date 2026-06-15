"use client";

import Link from "next/link";
import { BarChart3, Star, TrendingDown, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui";
import { formatCurrency } from "@/lib/utils";
import type { MenuEngineeringSnapshot } from "@/lib/menu/engineering";

const QUADRANT_STYLES = {
  star: { label: "Star", className: "bg-emerald-100 text-emerald-800", icon: Star },
  plowhorse: { label: "Plowhorse", className: "bg-blue-100 text-blue-800", icon: TrendingUp },
  puzzle: { label: "Puzzle", className: "bg-violet-100 text-violet-800", icon: BarChart3 },
  dog: { label: "Dog", className: "bg-slate-200 text-slate-700", icon: TrendingDown },
} as const;

interface MenuEngineeringPanelProps {
  data: MenuEngineeringSnapshot;
}

export function MenuEngineeringPanel({ data }: MenuEngineeringPanelProps) {
  const topStars = data.byQuadrant.star
    .sort((a, b) => b.contribution - a.contribution)
    .slice(0, 3);
  const topDogs = data.byQuadrant.dog
    .sort((a, b) => a.contribution - b.contribution)
    .slice(0, 3);

  return (
    <section className="card mb-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-orange-600" />
            <h2 className="text-lg font-semibold text-slate-900">Menu engineering</h2>
          </div>
          <p className="mt-1 text-sm text-slate-600">
            Last {data.periodDays} days — popularity vs profit margin. Treat the menu as a revenue
            asset, not just a list of dishes.
          </p>
        </div>
        <Link href="/analytics" className="text-sm font-medium text-orange-600 hover:underline">
          Full analytics →
        </Link>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(Object.keys(QUADRANT_STYLES) as Array<keyof typeof QUADRANT_STYLES>).map((key) => {
          const style = QUADRANT_STYLES[key];
          const count =
            key === "star"
              ? data.stars
              : key === "plowhorse"
                ? data.plowhorses
                : key === "puzzle"
                  ? data.puzzles
                  : data.dogs;
          return (
            <div key={key} className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-center">
              <Badge className={style.className}>{style.label}</Badge>
              <p className="mt-2 text-2xl font-bold text-slate-900">{count}</p>
              <p className="text-xs text-slate-500">items</p>
            </div>
          );
        })}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4">
          <h3 className="font-semibold text-emerald-900">Promote — Stars</h3>
          <p className="mt-0.5 text-xs text-emerald-800">High volume + high margin</p>
          <ul className="mt-2 space-y-1 text-sm text-emerald-950">
            {topStars.length ? (
              topStars.map((i) => (
                <li key={i.id} className="flex justify-between gap-2">
                  <span>{i.name}</span>
                  <span className="shrink-0 text-emerald-700">
                    {formatCurrency(i.contribution)} · {i.marginPct.toFixed(0)}% margin
                  </span>
                </li>
              ))
            ) : (
              <li className="text-emerald-800/70">No sales yet in this period</li>
            )}
          </ul>
        </div>
        <div className="rounded-xl border border-slate-300 bg-slate-50 p-4">
          <h3 className="font-semibold text-slate-900">Review — Dogs</h3>
          <p className="mt-0.5 text-xs text-slate-600">Low volume + low margin</p>
          <ul className="mt-2 space-y-1 text-sm text-slate-800">
            {topDogs.length ? (
              topDogs.map((i) => (
                <li key={i.id} className="flex justify-between gap-2">
                  <span>{i.name}</span>
                  <span className="shrink-0 text-slate-500">
                    {i.quantitySold} sold · {i.marginPct.toFixed(0)}% margin
                  </span>
                </li>
              ))
            ) : (
              <li className="text-slate-500">No dogs identified</li>
            )}
          </ul>
        </div>
      </div>

      <p className="mt-3 text-xs text-slate-500">
        Thresholds: avg popularity {data.avgPopularityPct.toFixed(1)}% · avg margin{" "}
        {data.avgMarginPct.toFixed(1)}% · {data.totalItemsSold} items sold ·{" "}
        {formatCurrency(data.totalContribution)} contribution
      </p>
    </section>
  );
}

export function quadrantBadge(quadrant: string | undefined) {
  if (!quadrant || !(quadrant in QUADRANT_STYLES)) return null;
  const style = QUADRANT_STYLES[quadrant as keyof typeof QUADRANT_STYLES];
  return (
    <Badge className={`${style.className} text-[10px]`}>{style.label}</Badge>
  );
}
