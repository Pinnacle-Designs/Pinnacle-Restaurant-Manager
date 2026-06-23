"use client";

import { createContext, useContext } from "react";
import { inferChartFromTable, type ChartPoint } from "@/lib/charts/parse-table";
import { SimpleBarChart } from "@/components/charts/SimpleBarChart";
import { SimpleLineChart } from "@/components/charts/SimpleLineChart";
import type { DataViewMode } from "@/components/charts/ViewModeToggle";

const AnalyticsViewModeContext = createContext<DataViewMode>("table");

export function AnalyticsViewModeProvider({
  mode,
  children,
}: {
  mode: DataViewMode;
  children: React.ReactNode;
}) {
  return (
    <AnalyticsViewModeContext.Provider value={mode}>{children}</AnalyticsViewModeContext.Provider>
  );
}

function DataTable({
  headers,
  rows,
}: {
  headers: string[];
  rows: Array<Array<string | number>>;
}) {
  if (rows.length === 0) return <p className="text-sm text-slate-500">No data yet.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-slate-500">
            {headers.map((h) => (
              <th key={h} className="pb-2 pr-4 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-slate-100">
              {row.map((cell, j) => (
                <td key={j} className="py-2 pr-4 text-slate-700">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export interface DataViewProps {
  headers: string[];
  rows: Array<Array<string | number>>;
  viewMode?: DataViewMode;
  chartKind?: "bar" | "line" | "auto";
  chartPoints?: ChartPoint[];
  valueLabel?: string;
  formatValue?: (value: number) => string;
}

export function DataView({
  headers,
  rows,
  viewMode,
  chartKind = "auto",
  chartPoints,
  valueLabel,
  formatValue,
}: DataViewProps) {
  const contextMode = useContext(AnalyticsViewModeContext);
  const mode = viewMode ?? contextMode;

  const inferred =
    chartPoints != null
      ? { kind: chartKind === "line" ? "line" as const : "bar" as const, points: chartPoints, valueHeader: valueLabel ?? "" }
      : inferChartFromTable(headers, rows, chartKind === "auto" ? undefined : chartKind);

  if (mode === "chart" && inferred && inferred.points.length > 0) {
    if (inferred.kind === "line") {
      return (
        <SimpleLineChart
          points={inferred.points}
          valueLabel={valueLabel ?? inferred.valueHeader}
          formatValue={formatValue}
        />
      );
    }
    return (
      <SimpleBarChart
        points={inferred.points}
        valueLabel={valueLabel ?? inferred.valueHeader}
        formatValue={formatValue}
      />
    );
  }

  return <DataTable headers={headers} rows={rows} />;
}
