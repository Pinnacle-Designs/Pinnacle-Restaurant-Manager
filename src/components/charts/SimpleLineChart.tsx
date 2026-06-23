"use client";

import { formatCurrency } from "@/lib/utils";
import type { ChartPoint } from "@/lib/charts/parse-table";

interface SimpleLineChartProps {
  points: ChartPoint[];
  valueLabel?: string;
  formatValue?: (value: number) => string;
}

export function SimpleLineChart({ points, valueLabel, formatValue }: SimpleLineChartProps) {
  if (points.length === 0) {
    return <p className="text-sm text-slate-500">No chart data yet.</p>;
  }

  const width = 640;
  const height = 220;
  const padX = 36;
  const padY = 28;
  const innerW = width - padX * 2;
  const innerH = height - padY * 2;
  const maxValue = Math.max(...points.map((p) => p.value), 1);
  const minValue = Math.min(...points.map((p) => p.value), 0);
  const range = maxValue - minValue || 1;
  const fmt = formatValue ?? ((v: number) => formatCurrency(v));

  const coords = points.map((p, i) => {
    const x = padX + (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
    const y = padY + innerH - ((p.value - minValue) / range) * innerH;
    return { ...p, x, y };
  });

  const polyline = coords.map((c) => `${c.x},${c.y}`).join(" ");

  return (
    <div>
      {valueLabel && (
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">{valueLabel}</p>
      )}
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="h-auto w-full min-w-[320px] max-w-full"
          role="img"
          aria-label={`Line chart: ${valueLabel ?? "values over time"}`}
        >
          {[0, 0.25, 0.5, 0.75, 1].map((t) => {
            const y = padY + innerH * (1 - t);
            const val = minValue + range * t;
            return (
              <g key={t}>
                <line x1={padX} y1={y} x2={width - padX} y2={y} stroke="#e2e8f0" strokeWidth="1" />
                <text x={4} y={y + 4} className="fill-slate-400 text-[10px]">
                  {fmt(val)}
                </text>
              </g>
            );
          })}
          <polyline
            fill="none"
            stroke="#f97316"
            strokeWidth="2.5"
            strokeLinejoin="round"
            strokeLinecap="round"
            points={polyline}
          />
          {coords.map((c) => (
            <g key={c.label}>
              <circle cx={c.x} cy={c.y} r="4" fill="#f97316" />
              <title>
                {c.label}: {fmt(c.value)}
              </title>
            </g>
          ))}
          {coords.map((c, i) => {
            if (points.length > 12 && i % Math.ceil(points.length / 8) !== 0 && i !== points.length - 1) {
              return null;
            }
            return (
              <text
                key={`${c.label}-x`}
                x={c.x}
                y={height - 6}
                textAnchor="middle"
                className="fill-slate-500 text-[9px]"
              >
                {c.label.length > 8 ? `${c.label.slice(0, 7)}…` : c.label}
              </text>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
