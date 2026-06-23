"use client";

import { formatCurrency } from "@/lib/utils";
import type { ChartPoint } from "@/lib/charts/parse-table";

interface SimpleBarChartProps {
  points: ChartPoint[];
  valueLabel?: string;
  formatValue?: (value: number) => string;
  maxBars?: number;
}

export function SimpleBarChart({
  points,
  valueLabel,
  formatValue,
  maxBars = 20,
}: SimpleBarChartProps) {
  if (points.length === 0) {
    return <p className="text-sm text-slate-500">No chart data yet.</p>;
  }

  const display = points.slice(0, maxBars);
  const maxValue = Math.max(...display.map((p) => p.value), 1);
  const fmt = formatValue ?? ((v: number) => formatCurrency(v));

  return (
    <div className="space-y-2">
      {valueLabel && (
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{valueLabel}</p>
      )}
      {display.map((p) => (
        <div key={p.label} className="flex items-center gap-3 text-sm">
          <span className="w-28 shrink-0 truncate text-slate-600" title={p.label}>
            {p.label}
          </span>
          <div className="h-5 flex-1 rounded bg-slate-100">
            <div
              className="h-full rounded bg-orange-400 transition-all"
              style={{ width: `${(p.value / maxValue) * 100}%` }}
            />
          </div>
          <span className="w-24 shrink-0 text-right font-medium text-slate-800">{fmt(p.value)}</span>
        </div>
      ))}
      {points.length > maxBars && (
        <p className="text-xs text-slate-400">Showing top {maxBars} of {points.length} rows.</p>
      )}
    </div>
  );
}
