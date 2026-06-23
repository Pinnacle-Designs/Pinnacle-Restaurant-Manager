"use client";

import type { ReportResult } from "@/lib/reports/types";
import { formatCellValue } from "@/lib/reports/export";
import { useLocationLocale } from "@/components/location/LocationLocaleProvider";
import { chartDataFromReport } from "@/lib/charts/report-chart";
import { SimpleBarChart } from "@/components/charts/SimpleBarChart";
import { SimpleLineChart } from "@/components/charts/SimpleLineChart";
import type { ReportViewMode } from "@/components/charts/ViewModeToggle";

interface ReportViewerProps {
  result: ReportResult | null;
  loading?: boolean;
  visualization?: ReportViewMode;
}

export function ReportViewer({ result, loading, visualization = "table" }: ReportViewerProps) {
  const { settings } = useLocationLocale();
  if (loading) {
    return (
      <div className="flex min-h-[200px] items-center justify-center rounded-xl border border-slate-200 bg-white p-8 text-slate-500">
        Generating report…
      </div>
    );
  }

  if (!result) {
    return (
      <div className="flex min-h-[200px] items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 p-8 text-slate-500">
        Configure columns and filters, then click Run report.
      </div>
    );
  }

  const chartData = chartDataFromReport(result, visualization);

  const formatChartValue = (value: number) => {
    const valueCol = result.columns.find((c) =>
      ["number", "currency", "percent"].includes(c.type)
    );
    return formatCellValue(value, valueCol?.type ?? "number", settings);
  };

  return (
    <>
      <div className="no-print overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-4 py-3">
          <h3 className="text-lg font-semibold text-slate-900">{result.title}</h3>
          {result.subtitle && (
            <p className="text-sm text-slate-500">{result.subtitle}</p>
          )}
          <p className="mt-1 text-xs text-slate-400">
            {result.rows.length} of {result.meta.totalRows} rows
            {result.meta.locationName ? ` · ${result.meta.locationName}` : ""}
            {visualization !== "table" ? ` · ${visualization === "bar" ? "Bar chart" : "Line chart"}` : ""}
          </p>
        </div>

        {visualization !== "table" && chartData ? (
          <div className="p-4">
            {chartData.kind === "line" ? (
              <SimpleLineChart
                points={chartData.points}
                valueLabel={chartData.valueLabel}
                formatValue={formatChartValue}
              />
            ) : (
              <SimpleBarChart
                points={chartData.points}
                valueLabel={chartData.valueLabel}
                formatValue={formatChartValue}
              />
            )}
          </div>
        ) : visualization !== "table" && !chartData ? (
          <div className="px-4 py-8 text-center text-sm text-slate-500">
            This report does not have numeric columns suitable for a chart. Switch to table view.
          </div>
        ) : (
          <div className="table-scroll max-h-[min(480px,60vh)] overflow-y-auto">
            <table className="report-table w-full min-w-[640px] text-sm">
              <thead className="sticky top-0 bg-slate-50">
                <tr>
                  {result.columns.map((col) => (
                    <th
                      key={col.id}
                      className="whitespace-nowrap px-4 py-2 text-left font-medium text-slate-600"
                    >
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.rows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={result.columns.length}
                      className="px-4 py-8 text-center text-slate-400"
                    >
                      No rows match your filters.
                    </td>
                  </tr>
                ) : (
                  result.rows.map((row, i) => (
                    <tr key={i} className="border-t border-slate-100 hover:bg-slate-50/50">
                      {result.columns.map((col) => (
                        <td key={col.id} className="whitespace-nowrap px-4 py-2 text-slate-800">
                          {formatCellValue(row[col.id], col.type, settings)}
                        </td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {result.footer && (
          <div className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500">
            {result.footer}
          </div>
        )}
      </div>

      {/* Print-only duplicate for custom report printing */}
      <div id="custom-report-print-root" className="print-only">
        <div className="mb-4">
          <h1 className="text-2xl font-bold">{result.title}</h1>
          {result.subtitle && <p className="text-slate-600">{result.subtitle}</p>}
        </div>
        <table className="report-table w-full text-sm">
          <thead>
            <tr>
              {result.columns.map((col) => (
                <th key={col.id} className="px-2 py-1 text-left font-semibold">
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {result.rows.map((row, i) => (
              <tr key={i}>
                {result.columns.map((col) => (
                  <td key={col.id} className="px-2 py-1">
                    {formatCellValue(row[col.id], col.type, settings)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {result.footer && <p className="mt-4 text-xs text-slate-600">{result.footer}</p>}
      </div>
    </>
  );
}
