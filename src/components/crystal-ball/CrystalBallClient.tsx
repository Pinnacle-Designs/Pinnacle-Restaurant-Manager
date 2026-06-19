"use client";

import { useState, useEffect, useCallback } from "react";
import { RefreshCw, Loader2, CloudRain, Sun, Calendar } from "lucide-react";
import { Button, Badge, StatCard, ScrollableTabs, TabPill } from "@/components/ui";
import { PageSectionShell, PageSection } from "@/components/layout/PageSections";
import { formatCurrency } from "@/lib/utils";

type Tab = "overlay" | "prep" | "par" | "trends";

export function CrystalBallClient() {
  const [tab, setTab] = useState<Tab>("overlay");
  const [data, setData] = useState<{
    overlay: {
      weatherSource: string;
      geoLabel: string | null;
      timezone: string | null;
      localTime: string | null;
      learnedPatternCount: number;
      upcomingEvents: Array<{ date: string; description: string; impactPct: number }>;
      dailyOverlays: Array<{
        date: string;
        condition: string;
        precipitationPct: number;
        isRainy: boolean;
        salesMultiplier: number;
        prepMultiplier: number;
        parMultiplier: number;
        drivers: string[];
      }>;
      summary: string;
    };
    microTrends: Array<{
      id: string;
      itemName: string;
      category: string;
      trigger: string;
      impactPct: number;
      confidence: "low" | "medium" | "high";
      action: string;
      sampleSize: number;
    }>;
    adjustedPrep: {
      date: string;
      dayOfWeek?: string;
      forecastCovers: number;
      summary: string;
      aiInsight?: string;
      menuItems?: Array<{
        menuItemId: string;
        menuItemName: string;
        category: string;
        forecastPlates: number;
        trendVsWeekAvgPct: number;
        ingredients: Array<{
          ingredient: string;
          unit: string;
          prepQty: number;
          rawQtyNeeded: number;
        }>;
      }>;
      dayparts?: Array<{
        daypart: string;
        label: string;
        forecastCovers: number;
        trendVsWeekAvgPct: number;
        menuItems?: Array<{
          menuItemId: string;
          menuItemName: string;
          category: string;
          forecastPlates: number;
          ingredients: Array<{
            ingredient: string;
            unit: string;
            prepQty: number;
          }>;
        }>;
        tasks: Array<{
          ingredient: string;
          unit: string;
          rawQtyNeeded: number;
          prepQty: number;
          priority: string;
        }>;
      }>;
      tasks: Array<{
        ingredient: string;
        unit: string;
        rawQtyNeeded: number;
        prepQty: number;
        priority: string;
        daypart?: string;
        overlayNote?: string;
      }>;
      overlay?: { condition: string; drivers: string[] };
    };
    adjustedPar: Array<{
      name: string;
      vendor: string;
      suggestedQty: number;
      unit: string;
      lineTotal: number;
      reason: string;
    }>;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/crystal-ball");
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const tabs: { id: Tab; label: string }[] = [
    { id: "overlay", label: "7-Day Overlay" },
    { id: "prep", label: "Adjusted Prep" },
    { id: "par", label: "Par Levels" },
    { id: "trends", label: "Micro-Trends" },
  ];

  const tomorrow = data?.overlay.dailyOverlays[0];
  const rainyDays = data?.overlay.dailyOverlays.filter((d) => d.isRainy).length ?? 0;
  const topTrend = data?.microTrends[0];

  const confidenceColor = {
    high: "bg-emerald-100 text-emerald-800",
    medium: "bg-amber-100 text-amber-800",
    low: "bg-slate-100 text-slate-600",
  };

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-600">{data?.overlay.summary ?? "Loading forecast overlay…"}</p>
        <Button variant="secondary" size="sm" onClick={load} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          <span className="ml-2">Refresh</span>
        </Button>
      </div>

      <PageSectionShell pageId="crystal-ball-metrics">
        <PageSection id="cb-key-metrics" title="Key metrics" defaultOpen>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            <StatCard
              label="Tomorrow multiplier"
              value={tomorrow ? `×${tomorrow.prepMultiplier}` : "—"}
              subtext={tomorrow?.condition}
            />
            <StatCard
              label="Local time"
              value={data?.overlay.localTime?.split(", ").pop() ?? "—"}
              subtext={data?.overlay.timezone ?? "Set postal code in Account → Location"}
            />
            <StatCard
              label="Rain days (7d)"
              value={String(rainyDays)}
              subtext={data?.overlay.geoLabel ?? data?.overlay.weatherSource}
            />
            <StatCard
              label="Learned patterns"
              value={String(data?.overlay.learnedPatternCount ?? "—")}
              subtext="From weather & events"
            />
            <StatCard
              label="Top micro-trend"
              value={topTrend ? `${topTrend.impactPct > 0 ? "+" : ""}${topTrend.impactPct}%` : "—"}
              subtext={topTrend?.itemName}
            />
          </div>
        </PageSection>
      </PageSectionShell>

      <ScrollableTabs className="mb-4 border-b border-slate-200 pb-2" menuLabel="Crystal Ball">
        {tabs.map((t) => (
          <TabPill key={t.id} active={tab === t.id} onClick={() => setTab(t.id)} variant="dark">
            {t.label}
          </TabPill>
        ))}
      </ScrollableTabs>

      {loading && !data ? (
        <div className="flex items-center justify-center py-16 text-slate-500">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          Reading the crystal ball…
        </div>
      ) : null}

      {data && tab === "overlay" ? (
        <PageSectionShell pageId={`crystal-ball-${tab}`}>
          {data.overlay.upcomingEvents.length > 0 ? (
            <PageSection id="cb-overlay-events" title="Upcoming events" defaultOpen>
              <ul className="space-y-2">
                {data.overlay.upcomingEvents.map((e) => (
                  <li key={e.date + e.description} className="flex flex-wrap items-center gap-2 text-sm">
                    <Calendar className="h-4 w-4 text-slate-400" />
                    <span className="font-mono text-slate-500">{e.date}</span>
                    <span>{e.description}</span>
                    <Badge className="bg-violet-100 text-violet-800">+{e.impactPct}%</Badge>
                  </li>
                ))}
              </ul>
            </PageSection>
          ) : null}

          <PageSection id="cb-overlay-daily" title="7-day overlay" defaultOpen={data.overlay.upcomingEvents.length === 0}>
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Condition</th>
                    <th className="px-4 py-3">Sales</th>
                    <th className="px-4 py-3">Prep</th>
                    <th className="px-4 py-3">Par</th>
                    <th className="px-4 py-3">Drivers</th>
                  </tr>
                </thead>
                <tbody>
                  {data.overlay.dailyOverlays.map((day) => (
                    <tr key={day.date} className="border-t border-slate-100">
                      <td className="px-4 py-3 font-mono">{day.date}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1.5">
                          {day.isRainy ? (
                            <CloudRain className="h-4 w-4 text-blue-500" />
                          ) : (
                            <Sun className="h-4 w-4 text-amber-500" />
                          )}
                          {day.condition}
                          {day.precipitationPct > 0 ? ` (${day.precipitationPct}%)` : ""}
                        </span>
                      </td>
                      <td className="px-4 py-3">×{day.salesMultiplier}</td>
                      <td className="px-4 py-3">×{day.prepMultiplier}</td>
                      <td className="px-4 py-3">×{day.parMultiplier}</td>
                      <td className="px-4 py-3 text-slate-600">{day.drivers.join(" · ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </PageSection>
        </PageSectionShell>
      ) : null}

      {data && tab === "prep" ? (
        <PageSectionShell pageId={`crystal-ball-${tab}`}>
          <PageSection id="cb-prep-summary" title="Prep forecast" description={data.adjustedPrep.summary} defaultOpen>
            <p className="text-sm text-slate-600">
              ~{data.adjustedPrep.forecastCovers} forecast covers for {data.adjustedPrep.date}
              {data.adjustedPrep.dayOfWeek ? ` (${data.adjustedPrep.dayOfWeek})` : ""}
            </p>
          </PageSection>

          {data.adjustedPrep.aiInsight ? (
            <PageSection id="cb-prep-ai" title="AI analysis">
              <p className="text-sm text-indigo-800">{data.adjustedPrep.aiInsight}</p>
            </PageSection>
          ) : null}

          {(data.adjustedPrep.menuItems ?? []).length > 0 ? (
            <PageSection id="cb-prep-menu-items" title="By menu item (full day)">
              <div className="space-y-3">
                {data.adjustedPrep.menuItems!.map((item) => (
                  <article key={item.menuItemId} className="rounded-xl border border-slate-200 bg-white">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
                      <div>
                        <p className="font-medium text-slate-900">{item.menuItemName}</p>
                        <p className="text-xs text-slate-500">{item.category}</p>
                      </div>
                      <Badge className="bg-slate-100 text-slate-800">~{item.forecastPlates} plates</Badge>
                    </div>
                    <ul className="divide-y divide-slate-100 text-sm">
                      {item.ingredients.map((ing) => (
                        <li key={ing.ingredient} className="flex justify-between px-4 py-2">
                          <span>{ing.ingredient}</span>
                          <span className="text-slate-600">
                            {ing.prepQty} {ing.unit}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </article>
                ))}
              </div>
            </PageSection>
          ) : null}

          {(data.adjustedPrep.dayparts ?? []).length > 0
            ? data.adjustedPrep.dayparts!
                .filter((b) => b.daypart !== "late" || (b.menuItems?.length ?? 0) > 0 || b.tasks.length > 0)
                .map((block) => (
                  <PageSection
                    key={block.daypart}
                    id={`cb-prep-${block.daypart}`}
                    title={block.label}
                    description={`~${block.forecastCovers} covers${
                      block.trendVsWeekAvgPct !== 0
                        ? ` · ${block.trendVsWeekAvgPct > 0 ? "+" : ""}${block.trendVsWeekAvgPct}% vs weekly avg`
                        : ""
                    }`}
                  >
                    {(block.menuItems ?? []).length > 0 ? (
                      <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
                        {block.menuItems!.map((item) => (
                          <div key={item.menuItemId} className="px-4 py-3">
                            <p className="font-medium text-slate-900">
                              {item.menuItemName}{" "}
                              <span className="text-slate-500">(~{item.forecastPlates})</span>
                            </p>
                            <ul className="mt-1 space-y-1 text-sm text-slate-600">
                              {item.ingredients.map((ing) => (
                                <li key={ing.ingredient}>
                                  {ing.ingredient}: {ing.prepQty} {ing.unit}
                                </li>
                              ))}
                            </ul>
                          </div>
                        ))}
                      </div>
                    ) : block.tasks.length === 0 ? (
                      <p className="text-sm text-slate-500">No forecast for this period.</p>
                    ) : (
                      <div className="overflow-x-auto rounded-xl border border-slate-200">
                        <table className="w-full text-sm">
                          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                            <tr>
                              <th className="px-4 py-3">Ingredient</th>
                              <th className="px-4 py-3">Prep qty</th>
                              <th className="px-4 py-3">Raw needed</th>
                              <th className="px-4 py-3">Priority</th>
                            </tr>
                          </thead>
                          <tbody>
                            {block.tasks.map((t) => (
                              <tr key={`${block.daypart}-${t.ingredient}`} className="border-t border-slate-100">
                                <td className="px-4 py-3 font-medium">{t.ingredient}</td>
                                <td className="px-4 py-3">
                                  {t.prepQty} {t.unit}
                                </td>
                                <td className="px-4 py-3">
                                  {t.rawQtyNeeded} {t.unit}
                                </td>
                                <td className="px-4 py-3">
                                  <Badge className={t.priority === "HIGH" ? "bg-orange-100 text-orange-800" : ""}>
                                    {t.priority}
                                  </Badge>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </PageSection>
                ))
            : (data.adjustedPrep.menuItems ?? []).length === 0 ? (
                <PageSection id="cb-prep-tasks" title="Prep tasks">
                  <div className="overflow-x-auto rounded-xl border border-slate-200">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                        <tr>
                          <th className="px-4 py-3">Ingredient</th>
                          <th className="px-4 py-3">Prep qty</th>
                          <th className="px-4 py-3">Raw needed</th>
                          <th className="px-4 py-3">Priority</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.adjustedPrep.tasks.slice(0, 20).map((t) => (
                          <tr key={t.ingredient} className="border-t border-slate-100">
                            <td className="px-4 py-3 font-medium">{t.ingredient}</td>
                            <td className="px-4 py-3">
                              {t.prepQty} {t.unit}
                            </td>
                            <td className="px-4 py-3">
                              {t.rawQtyNeeded} {t.unit}
                            </td>
                            <td className="px-4 py-3">
                              <Badge className={t.priority === "HIGH" ? "bg-orange-100 text-orange-800" : ""}>
                                {t.priority}
                              </Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </PageSection>
              ) : null}
        </PageSectionShell>
      ) : null}

      {data && tab === "par" ? (
        <PageSectionShell pageId={`crystal-ball-${tab}`}>
          <PageSection id="cb-par-levels" title="Adjusted par levels" defaultOpen>
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Item</th>
                    <th className="px-4 py-3">Vendor</th>
                    <th className="px-4 py-3">Suggested qty</th>
                    <th className="px-4 py-3">Est. cost</th>
                    <th className="px-4 py-3">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {data.adjustedPar.slice(0, 15).map((row) => (
                    <tr key={row.name} className="border-t border-slate-100">
                      <td className="px-4 py-3 font-medium">{row.name}</td>
                      <td className="px-4 py-3 text-slate-600">{row.vendor}</td>
                      <td className="px-4 py-3">
                        {row.suggestedQty} {row.unit}
                      </td>
                      <td className="px-4 py-3">{formatCurrency(row.lineTotal)}</td>
                      <td className="px-4 py-3 text-slate-600">{row.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </PageSection>
        </PageSectionShell>
      ) : null}

      {data && tab === "trends" ? (
        <PageSectionShell pageId={`crystal-ball-${tab}`}>
          <PageSection
            id="cb-trends-intro"
            title="Micro-trends"
            description="Correlations from the last 90 days — high-confidence alerts also appear in Command Center."
            defaultOpen
          >
            {data.microTrends.length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-slate-500">
                Not enough tagged days yet. Log weather & events under Analytics → External factors.
              </p>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {data.microTrends.map((t) => (
                  <article key={t.id} className="rounded-xl border border-slate-200 bg-white p-4">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <h4 className="font-semibold text-slate-900">{t.itemName}</h4>
                      <Badge className={confidenceColor[t.confidence]}>{t.confidence}</Badge>
                      <Badge className={t.impactPct >= 0 ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"}>
                        {t.impactPct > 0 ? "+" : ""}
                        {t.impactPct}%
                      </Badge>
                    </div>
                    <p className="text-xs uppercase tracking-wide text-slate-500">{t.trigger}</p>
                    <p className="mt-2 text-sm text-slate-700">{t.action}</p>
                    <p className="mt-2 text-xs text-slate-400">{t.sampleSize} sample days · {t.category}</p>
                  </article>
                ))}
              </div>
            )}
          </PageSection>
        </PageSectionShell>
      ) : null}
    </div>
  );
}
