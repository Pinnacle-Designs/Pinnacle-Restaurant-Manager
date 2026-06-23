import type { ReportResult } from "@/lib/reports/types";
import type { ChartPoint } from "@/lib/charts/parse-table";

export type ReportVisualization = "table" | "bar" | "line";

const NUMERIC_TYPES = new Set(["number", "currency", "percent"]);

function looksLikeDate(label: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}/.test(label) ||
    /^\d{1,2}\/\d{1,2}/.test(label) ||
    /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i.test(
      label
    )
  );
}

function toNumber(value: string | number | null | undefined): number | null {
  if (value == null || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const n = parseFloat(String(value));
  return Number.isFinite(n) ? n : null;
}

export function chartDataFromReport(
  result: ReportResult,
  visualization: ReportVisualization
): { kind: "bar" | "line"; points: ChartPoint[]; valueLabel: string } | null {
  if (visualization === "table" || result.rows.length === 0) return null;

  const labelCol =
    result.columns.find((c) => c.type === "text" || c.type === "badge") ?? result.columns[0];
  const valueCol =
    result.columns.find((c) => NUMERIC_TYPES.has(c.type) && c.id !== labelCol?.id) ??
    result.columns.find((c) => NUMERIC_TYPES.has(c.type));

  if (!labelCol || !valueCol) return null;

  const points: ChartPoint[] = result.rows
    .map((row) => {
      const value = toNumber(row[valueCol.id]);
      if (value == null) return null;
      return { label: String(row[labelCol.id] ?? ""), value };
    })
    .filter((p): p is ChartPoint => p !== null && p.label.length > 0);

  if (points.length === 0) return null;

  const dateLike = points.length > 1 && points.every((p) => looksLikeDate(p.label));
  const kind =
    visualization === "line" ? "line" : visualization === "bar" ? "bar" : dateLike ? "line" : "bar";

  return { kind, points, valueLabel: valueCol.label };
}
