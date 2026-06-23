export type ChartPoint = { label: string; value: number };

export function parseNumericCell(cell: string | number): number | null {
  if (typeof cell === "number") return Number.isFinite(cell) ? cell : null;
  const s = String(cell).replace(/[$,%\s]/g, "").replace(/,/g, "");
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

function looksLikeDate(label: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}/.test(label) ||
    /^\d{1,2}\/\d{1,2}/.test(label) ||
    /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i.test(
      label
    )
  );
}

export function inferChartFromTable(
  headers: string[],
  rows: Array<Array<string | number>>,
  preferredKind?: "bar" | "line"
): { kind: "bar" | "line"; points: ChartPoint[]; valueHeader: string } | null {
  if (rows.length === 0 || headers.length < 2) return null;

  let valueCol = -1;
  for (let col = 1; col < headers.length; col++) {
    if (rows.some((r) => parseNumericCell(r[col]) !== null)) {
      valueCol = col;
      break;
    }
  }
  if (valueCol < 0) return null;

  const points: ChartPoint[] = rows.map((r) => ({
    label: String(r[0] ?? ""),
    value: parseNumericCell(r[valueCol]) ?? 0,
  }));

  const dateLike = points.length > 1 && points.every((p) => looksLikeDate(p.label));
  const kind =
    preferredKind ?? (dateLike ? "line" : "bar");

  return { kind, points, valueHeader: headers[valueCol] ?? "Value" };
}
