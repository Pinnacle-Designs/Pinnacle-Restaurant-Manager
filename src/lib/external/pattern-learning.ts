import type { ExternalFactorCategory, LearnedPattern } from "@/lib/analytics/types";

export const EXTERNAL_CATEGORY_LABELS: Record<ExternalFactorCategory, string> = {
  weather: "Weather",
  event: "Local events",
  holiday: "Holidays",
  sports: "Sports games",
  tourism: "Tourism levels",
  school: "School schedules",
};

export const ALL_EXTERNAL_CATEGORIES = Object.keys(
  EXTERNAL_CATEGORY_LABELS
) as ExternalFactorCategory[];

export function buildCategoryCoverage(
  byCategory: Array<{ category: ExternalFactorCategory; count: number; avgImpactPct: number }>,
  learnedPatterns: LearnedPattern[],
  hasWeatherForecast: boolean
) {
  return ALL_EXTERNAL_CATEGORIES.map((category) => {
    const tracked = byCategory.find((c) => c.category === category);
    const learned = learnedPatterns.some((p) => p.category === category);
    const trackedViaForecast = category === "weather" && hasWeatherForecast;
    return {
      category,
      label: EXTERNAL_CATEGORY_LABELS[category],
      tracked: Boolean(tracked) || trackedViaForecast,
      learned,
      avgImpactPct: tracked?.avgImpactPct ?? null,
    };
  });
}

export interface DayMetrics {
  sales: number;
  deliverySales: number;
  dineInSales: number;
  orders: number;
  guests: number;
}

export interface FactorRecord {
  date: Date;
  factorType: string;
  description: string;
  impactPct: number;
}

function dateKey(d: Date) {
  return d.toISOString().split("T")[0]!;
}

function orderNetAmount(o: {
  totalAmount: number;
  discountAmount: number;
  compAmount: number;
  voidAmount: number;
}) {
  return o.totalAmount - o.discountAmount - o.compAmount - o.voidAmount;
}

export function normalizeFactorCategory(factorType: string, description: string): ExternalFactorCategory {
  const t = `${factorType} ${description}`.toLowerCase();
  if (/weather|rain|snow|heat|storm|forecast|drizzle/i.test(t)) return "weather";
  if (/holiday|festival|thanksgiving|christmas|easter|july 4|new year/i.test(t)) return "holiday";
  if (/sport|game|stadium|match|playoff|nfl|nba|mlb/i.test(t)) return "sports";
  if (/touris|convention|visitor|hotel/i.test(t)) return "tourism";
  if (/school|university|college|graduation|break|semester/i.test(t)) return "school";
  return "event";
}

function buildDayMetrics(
  paidOrders: Array<{
    createdAt: Date;
    channel: string | null;
    guestCount: number;
    totalAmount: number;
    discountAmount: number;
    compAmount: number;
    voidAmount: number;
  }>
): Record<string, DayMetrics> {
  const days: Record<string, DayMetrics> = {};
  for (const o of paidOrders) {
    const dk = dateKey(o.createdAt);
    if (!days[dk]) {
      days[dk] = { sales: 0, deliverySales: 0, dineInSales: 0, orders: 0, guests: 0 };
    }
    const net = orderNetAmount(o);
    const ch = (o.channel || "dine-in").toLowerCase();
    days[dk].sales += net;
    days[dk].orders += 1;
    days[dk].guests += o.guestCount;
    if (/delivery|doordash|grubhub|uber|postmates/i.test(ch)) {
      days[dk].deliverySales += net;
    } else if (ch === "dine-in" || ch === "pickup") {
      days[dk].dineInSales += net;
    }
  }
  return days;
}

function median(values: number[]) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

function pctChange(value: number, baseline: number) {
  if (baseline === 0) return value > 0 ? 100 : 0;
  return ((value - baseline) / baseline) * 100;
}

function confidence(sampleSize: number): LearnedPattern["confidence"] {
  if (sampleSize >= 5) return "high";
  if (sampleSize >= 3) return "medium";
  return "low";
}

function learnCategoryImpact(
  category: ExternalFactorCategory,
  label: string,
  factorDates: Set<string>,
  dayMetrics: Record<string, DayMetrics>,
  metric: LearnedPattern["metric"],
  insightTemplate: (impact: number) => string
): LearnedPattern | null {
  const allDays = Object.entries(dayMetrics);
  if (allDays.length < 4) return null;

  const baselineDays = allDays.filter(([d]) => !factorDates.has(d));
  const factorDays = allDays.filter(([d]) => factorDates.has(d));
  if (factorDays.length === 0) return null;

  const pick = (m: DayMetrics) => {
    switch (metric) {
      case "delivery":
        return m.sales > 0 ? m.deliverySales / m.sales : 0;
      case "dine-in":
        return m.sales > 0 ? m.dineInSales / m.sales : 0;
      case "orders":
        return m.orders;
      case "guests":
        return m.guests;
      default:
        return m.sales;
    }
  };

  const baseline =
    metric === "delivery" || metric === "dine-in"
      ? median(baselineDays.map(([, m]) => pick(m)))
      : median(baselineDays.map(([, m]) => pick(m))) || 1;

  const factorAvg =
    factorDays.reduce((s, [, m]) => s + pick(m), 0) / factorDays.length;

  const impactPct = pctChange(factorAvg, baseline);
  if (Math.abs(impactPct) < 3 && factorDays.length < 2) return null;

  return {
    category,
    pattern: label,
    metric,
    impactPct: Math.round(impactPct * 10) / 10,
    confidence: confidence(factorDays.length),
    insight: insightTemplate(Math.round(impactPct)),
    sampleSize: factorDays.length,
  };
}

/** Correlate historical orders with logged external factors to learn impact patterns. */
export function learnExternalPatterns(
  paidOrders: Array<{
    createdAt: Date;
    channel: string | null;
    guestCount: number;
    totalAmount: number;
    discountAmount: number;
    compAmount: number;
    voidAmount: number;
  }>,
  externalFactors: FactorRecord[]
): LearnedPattern[] {
  const dayMetrics = buildDayMetrics(paidOrders);
  const patterns: LearnedPattern[] = [];

  const byCategory = new Map<ExternalFactorCategory, Set<string>>();
  for (const f of externalFactors) {
    const cat = normalizeFactorCategory(f.factorType, f.description);
    if (!byCategory.has(cat)) byCategory.set(cat, new Set());
    byCategory.get(cat)!.add(dateKey(f.date));
  }

  const weatherDates = byCategory.get("weather") ?? new Set<string>();
  const rainDates = new Set(
    externalFactors
      .filter((f) => /rain|storm|shower|drizzle/i.test(`${f.factorType} ${f.description}`))
      .map((f) => dateKey(f.date))
  );
  const weatherSet = rainDates.size > 0 ? rainDates : weatherDates;

  const weatherDelivery = learnCategoryImpact(
    "weather",
    "Rainy / bad weather days",
    weatherSet,
    dayMetrics,
    "delivery",
    (impact) =>
      impact >= 0
        ? `Rainy days increase delivery by ~${Math.abs(impact).toFixed(0)}%`
        : `Rainy days decrease delivery share by ~${Math.abs(impact).toFixed(0)}%`
  );
  if (weatherDelivery) patterns.push(weatherDelivery);

  const weatherSales = learnCategoryImpact(
    "weather",
    "Weather impact on sales",
    weatherSet,
    dayMetrics,
    "sales",
    (impact) =>
      `Weather-impacted days show ~${impact >= 0 ? "+" : ""}${impact.toFixed(0)}% sales vs baseline`
  );
  if (weatherSales) patterns.push(weatherSales);

  const eventSet = byCategory.get("event") ?? new Set<string>();
  const eventSales = learnCategoryImpact(
    "event",
    "Local events & concerts",
    eventSet,
    dayMetrics,
    "sales",
    (impact) => `Event nights increase sales by ~${Math.abs(impact).toFixed(0)}%`
  );
  if (eventSales) patterns.push(eventSales);

  const holidaySet = byCategory.get("holiday") ?? new Set<string>();
  const holidaySales = learnCategoryImpact(
    "holiday",
    "Holidays",
    holidaySet,
    dayMetrics,
    "sales",
    (impact) => `Holidays shift sales by ~${impact >= 0 ? "+" : ""}${impact.toFixed(0)}%`
  );
  if (holidaySales) patterns.push(holidaySales);

  const sportsSet = byCategory.get("sports") ?? new Set<string>();
  const sportsSales = learnCategoryImpact(
    "sports",
    "Sports games",
    sportsSet,
    dayMetrics,
    "sales",
    (impact) => `Game nights increase sales by ~${Math.abs(impact).toFixed(0)}%`
  );
  if (sportsSales) patterns.push(sportsSales);

  const tourismSet = byCategory.get("tourism") ?? new Set<string>();
  const tourismSales = learnCategoryImpact(
    "tourism",
    "Tourism & conventions",
    tourismSet,
    dayMetrics,
    "guests",
    (impact) => `High tourism periods lift guest count by ~${Math.abs(impact).toFixed(0)}%`
  );
  if (tourismSales) patterns.push(tourismSales);

  const schoolSet = byCategory.get("school") ?? new Set<string>();
  const schoolSales = learnCategoryImpact(
    "school",
    "School schedules",
    schoolSet,
    dayMetrics,
    "sales",
    (impact) =>
      `School calendar shifts sales by ~${impact >= 0 ? "+" : ""}${impact.toFixed(0)}% (breaks vs in-session)`
  );
  if (schoolSales) patterns.push(schoolSales);

  // Merge with manually logged impactPct averages when learning sample is thin
  for (const f of externalFactors) {
    if (/rain.*delivery/i.test(f.description) && !patterns.some((p) => p.pattern.includes("Rainy"))) {
      patterns.push({
        category: "weather",
        pattern: "Logged weather pattern",
        metric: "delivery",
        impactPct: f.impactPct,
        confidence: "medium",
        insight: f.description,
        sampleSize: 1,
      });
    }
    if (/concert/i.test(f.description) && !patterns.some((p) => p.category === "event")) {
      patterns.push({
        category: "event",
        pattern: "Logged event pattern",
        metric: "sales",
        impactPct: f.impactPct,
        confidence: "medium",
        insight: f.description,
        sampleSize: 1,
      });
    }
  }

  return patterns
    .sort((a, b) => Math.abs(b.impactPct) - Math.abs(a.impactPct))
    .slice(0, 8);
}

export function buildPatternSummaries(patterns: LearnedPattern[]) {
  return patterns.map((p) => ({
    pattern: p.pattern,
    insight: p.insight,
    category: p.category,
    confidence: p.confidence,
    impactPct: p.impactPct,
  }));
}
