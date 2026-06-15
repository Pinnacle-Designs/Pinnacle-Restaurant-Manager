export const FRACTION_COVERAGES = [
  "WHOLE",
  "LEFT_HALF",
  "RIGHT_HALF",
  "TOP_HALF",
  "BOTTOM_HALF",
] as const;

export type FractionCoverage = (typeof FRACTION_COVERAGES)[number];

export const FRACTION_COVERAGE_LABELS: Record<FractionCoverage, string> = {
  WHOLE: "Whole",
  LEFT_HALF: "Left half",
  RIGHT_HALF: "Right half",
  TOP_HALF: "Top half",
  BOTTOM_HALF: "Bottom half",
};

export type FractionalModifierSelection = {
  groupId: string;
  groupName: string;
  optionId: string;
  optionName: string;
  priceDelta: number;
  coverage: FractionCoverage;
};

export function isFractionCoverage(value: string): value is FractionCoverage {
  return FRACTION_COVERAGES.includes(value as FractionCoverage);
}

export function buildFractionalSummary(selections: FractionalModifierSelection[]): string {
  const byCoverage = new Map<FractionCoverage, string[]>();
  for (const sel of selections) {
    const list = byCoverage.get(sel.coverage) ?? [];
    list.push(sel.optionName);
    byCoverage.set(sel.coverage, list);
  }

  const parts: string[] = [];
  const left = byCoverage.get("LEFT_HALF");
  const right = byCoverage.get("RIGHT_HALF");
  if (left?.length && right?.length) {
    parts.push(`½ ${left.join(", ")} | ½ ${right.join(", ")}`);
  } else if (left?.length) {
    parts.push(`Left: ${left.join(", ")}`);
  } else if (right?.length) {
    parts.push(`Right: ${right.join(", ")}`);
  }

  const whole = byCoverage.get("WHOLE") ?? [];
  if (whole.length) {
    parts.push(...whole.map((n) => `${n} (whole)`));
  }

  for (const cov of ["TOP_HALF", "BOTTOM_HALF"] as FractionCoverage[]) {
    const items = byCoverage.get(cov);
    if (items?.length) {
      parts.push(`${FRACTION_COVERAGE_LABELS[cov]}: ${items.join(", ")}`);
    }
  }

  return parts.join(" · ");
}

export function fractionalPriceDelta(selections: FractionalModifierSelection[]): number {
  const sum = selections.reduce((acc, s) => acc + s.priceDelta, 0);
  return Math.round(sum * 100) / 100;
}
