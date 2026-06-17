"use client";

import { useState, useEffect, useCallback } from "react";
import {
  RefreshCw,
  Loader2,
} from "lucide-react";
import { Button, Badge, StatCard } from "@/components/ui";
import { ForgottenClockOutAlert } from "@/components/staff/ForgottenClockOutAlert";
import { ComplianceAlertsBanner } from "@/components/staff/ComplianceAlertsBanner";
import { formatCurrency } from "@/lib/utils";
import type { MenuEngineeringSnapshot } from "@/lib/menu/engineering";

const QUADRANT_STYLES = {
  star: { label: "Star", className: "bg-emerald-500", text: "text-emerald-800", bg: "bg-emerald-100" },
  plowhorse: { label: "Plowhorse", className: "bg-blue-500", text: "text-blue-800", bg: "bg-blue-100" },
  puzzle: { label: "Puzzle", className: "bg-violet-500", text: "text-violet-800", bg: "bg-violet-100" },
  dog: { label: "Dog", className: "bg-slate-400", text: "text-slate-700", bg: "bg-slate-200" },
} as const;

type Tab = "avt" | "cogs" | "matrix" | "waste";

export function BackOfficeClient() {
  const [tab, setTab] = useState<Tab>("avt");
  const [data, setData] = useState<{
    avt: {
      lines: Array<{
        name: string;
        theoreticalQty: number;
        actualQty: number;
        varianceQty: number;
        variancePct: number;
        varianceCost: number;
        unit: string;
        flag: string;
        likelyCause?: string;
      }>;
      totalVarianceCost: number;
      summary: string;
      periodDays: number;
    };
    liveCogs: {
      monthLabel: string;
      mtdSales: number;
      mtdLiveCogs: number;
      liveCogsPct: number;
      theoreticalCogsPct: number;
      variancePct: number;
      mtdWasteCost: number;
      dailyTrend: Array<{ date: string; sales: number; cogsPct: number }>;
      asOf: string;
    };
    waste: {
      totalCost: number;
      byCategory: Array<{ category: string; cost: number; count: number }>;
      byEmployee: Array<{ name: string; cost: number; count: number }>;
      byShift: Array<{ shiftLabel: string; cost: number }>;
      recent: Array<{
        itemName: string;
        cost: number;
        reason: string;
        category: string | null;
        employee: string | null;
      }>;
    };
    menuEngineering: MenuEngineeringSnapshot;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/back-office");
      setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const tabs: { id: Tab; label: string }[] = [
    { id: "avt", label: "AvT Variance" },
    { id: "cogs", label: "Live COGS" },
    { id: "matrix", label: "Menu Matrix" },
    { id: "waste", label: "Waste" },
  ];

  const me = data?.menuEngineering;
  const overLines = data?.avt.lines.filter((l) => l.flag === "OVER").length ?? 0;

  return (
    <div>
      <ForgottenClockOutAlert variant="banner" className="mb-6" />
      <ComplianceAlertsBanner variant="banner" className="mb-6" />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Live COGS (MTD)"
          value={data ? `${data.liveCogs.liveCogsPct}%` : "—"}
          subtext={data?.liveCogs.monthLabel}
        />
        <StatCard
          label="AvT variance"
          value={data ? formatCurrency(data.avt.totalVarianceCost) : "—"}
          subtext={`${overLines} items over theoretical`}
        />
        <StatCard
          label="Waste loss (30d)"
          value={data ? formatCurrency(data.waste.totalCost) : "—"}
        />
        <StatCard
          label="Menu stars"
          value={me?.stars ?? "—"}
          subtext={`${me?.dogs ?? 0} dogs to review`}
        />
      </div>

      <div className="no-print mb-4 flex flex-wrap gap-2 border-b border-slate-200 pb-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`rounded-lg px-3 py-2 text-sm font-medium ${
              tab === t.id ? "bg-orange-100 text-orange-800" : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            {t.label}
          </button>
        ))}
        <Button variant="ghost" size="sm" onClick={load} className="ml-auto">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {loading || !data ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
        </div>
      ) : (
        <>
          {tab === "avt" && (
            <div className="card">
              <h2 className="mb-1 font-semibold">Actual vs. Theoretical Variance</h2>
              <p className="mb-4 text-sm text-slate-500">{data.avt.summary}</p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-slate-500">
                      <th className="pb-2 pr-4">Ingredient</th>
                      <th className="pb-2 pr-4">Theoretical</th>
                      <th className="pb-2 pr-4">Actual</th>
                      <th className="pb-2 pr-4">Variance</th>
                      <th className="pb-2 pr-4">$ Impact</th>
                      <th className="pb-2">Flag</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.avt.lines.slice(0, 20).map((l) => (
                      <tr key={l.name} className="border-b border-slate-100">
                        <td className="py-3 pr-4 font-medium">{l.name}</td>
                        <td className="py-3 pr-4">
                          {l.theoreticalQty} {l.unit}
                        </td>
                        <td className="py-3 pr-4">
                          {l.actualQty} {l.unit}
                        </td>
                        <td className="py-3 pr-4">
                          <span className={l.variancePct > 0 ? "text-red-600" : "text-green-700"}>
                            {l.varianceQty > 0 ? "+" : ""}
                            {l.variancePct}%
                          </span>
                        </td>
                        <td className="py-3 pr-4">{formatCurrency(l.varianceCost)}</td>
                        <td className="py-3">
                          <Badge
                            className={
                              l.flag === "OVER"
                                ? "bg-red-100 text-red-800"
                                : l.flag === "UNDER"
                                  ? "bg-amber-100 text-amber-800"
                                  : "bg-green-100 text-green-800"
                            }
                          >
                            {l.flag}
                          </Badge>
                          {l.likelyCause && (
                            <p className="mt-1 text-xs text-slate-500">{l.likelyCause}</p>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {tab === "cogs" && (
            <div className="grid gap-6 lg:grid-cols-2">
              <div className="card">
                <h2 className="mb-4 font-semibold">Live COGS — {data.liveCogs.monthLabel}</h2>
                <p className="mb-4 text-xs text-slate-500">
                  Updated {new Date(data.liveCogs.asOf).toLocaleString()} — no waiting for month-end close
                </p>
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-600">MTD sales</span>
                    <span className="font-semibold">{formatCurrency(data.liveCogs.mtdSales)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Live COGS</span>
                    <span className="font-semibold text-orange-700">
                      {formatCurrency(data.liveCogs.mtdLiveCogs)} ({data.liveCogs.liveCogsPct}%)
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Theoretical COGS</span>
                    <span>{data.liveCogs.theoreticalCogsPct}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Waste (MTD)</span>
                    <span>{formatCurrency(data.liveCogs.mtdWasteCost)}</span>
                  </div>
                </div>
              </div>
              <div className="card">
                <h2 className="mb-4 font-semibold">Daily COGS %</h2>
                <div className="space-y-2">
                  {data.liveCogs.dailyTrend.slice(-10).map((d) => (
                    <div key={d.date} className="flex items-center gap-3 text-sm">
                      <span className="w-24 text-slate-500">{d.date}</span>
                      <div className="h-4 flex-1 rounded bg-slate-100">
                        <div
                          className="h-full rounded bg-orange-400"
                          style={{ width: `${Math.min(d.cogsPct * 2, 100)}%` }}
                        />
                      </div>
                      <span className="w-12 text-right font-medium">{d.cogsPct}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {tab === "matrix" && me && (
            <div className="card">
              <h2 className="mb-2 font-semibold">Menu Engineering Matrix</h2>
              <p className="mb-4 text-sm text-slate-500">
                Popularity vs. profit margin — last {me.periodDays} days
              </p>
              <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {(Object.keys(QUADRANT_STYLES) as Array<keyof typeof QUADRANT_STYLES>).map((key) => {
                  const style = QUADRANT_STYLES[key];
                  const count =
                    key === "star" ? me.stars : key === "plowhorse" ? me.plowhorses : key === "puzzle" ? me.puzzles : me.dogs;
                  return (
                    <div key={key} className={`rounded-lg p-3 text-center ${style.bg}`}>
                      <p className={`text-sm font-medium ${style.text}`}>{style.label}</p>
                      <p className="text-2xl font-bold">{count}</p>
                    </div>
                  );
                })}
              </div>
              <div className="relative mx-auto aspect-square max-w-lg rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="absolute left-1/2 top-0 bottom-8 w-px bg-slate-300" />
                <div className="absolute left-0 right-0 top-1/2 bottom-8 h-px bg-slate-300" />
                <p className="absolute bottom-1 left-1/2 -translate-x-1/2 text-xs text-slate-500">
                  Popularity →
                </p>
                <p className="absolute left-1 top-1/2 -translate-y-1/2 -rotate-90 text-xs text-slate-500">
                  Margin →
                </p>
                {me.items
                  .filter((i) => i.quantitySold > 0)
                  .map((item) => {
                    const x = Math.min(95, Math.max(5, (item.popularityPct / (me.avgPopularityPct * 2 || 1)) * 50));
                    const y = Math.min(95, Math.max(5, 100 - (item.marginPct / (me.avgMarginPct * 2 || 1)) * 50));
                    const style = QUADRANT_STYLES[item.quadrant];
                    return (
                      <div
                        key={item.id}
                        className="absolute group"
                        style={{ left: `${x}%`, bottom: `${y}%`, transform: "translate(-50%, 50%)" }}
                        title={`${item.name} — ${item.marginPct.toFixed(0)}% margin, ${item.popularityPct.toFixed(1)}% mix`}
                      >
                        <div className={`h-3 w-3 rounded-full ${style.className} ring-2 ring-white`} />
                        <span className="pointer-events-none absolute bottom-4 left-1/2 hidden -translate-x-1/2 whitespace-nowrap rounded bg-slate-900 px-2 py-1 text-xs text-white group-hover:block">
                          {item.name}
                        </span>
                      </div>
                    );
                  })}
                <span className="absolute right-2 top-2 text-xs text-emerald-700">Puzzles</span>
                <span className="absolute left-2 top-2 text-xs text-emerald-700">Stars</span>
                <span className="absolute right-2 bottom-10 text-xs text-slate-500">Dogs</span>
                <span className="absolute left-2 bottom-10 text-xs text-blue-700">Plowhorses</span>
              </div>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-slate-500">
                      <th className="pb-2">Item</th>
                      <th className="pb-2">Quadrant</th>
                      <th className="pb-2">Sold</th>
                      <th className="pb-2">Margin</th>
                      <th className="pb-2">Contribution</th>
                    </tr>
                  </thead>
                  <tbody>
                    {me.items
                      .filter((i) => i.quantitySold > 0)
                      .sort((a, b) => b.contribution - a.contribution)
                      .slice(0, 12)
                      .map((i) => (
                        <tr key={i.id} className="border-b border-slate-100">
                          <td className="py-2 font-medium">{i.name}</td>
                          <td className="py-2">
                            <Badge className={QUADRANT_STYLES[i.quadrant].bg + " " + QUADRANT_STYLES[i.quadrant].text}>
                              {QUADRANT_STYLES[i.quadrant].label}
                            </Badge>
                          </td>
                          <td className="py-2">{i.quantitySold}</td>
                          <td className="py-2">{i.marginPct.toFixed(1)}%</td>
                          <td className="py-2">{formatCurrency(i.contribution)}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {tab === "waste" && (
            <div className="grid gap-6 lg:grid-cols-2">
              <div className="card">
                <h2 className="mb-4 font-semibold">Loss by category</h2>
                <div className="space-y-2">
                  {data.waste.byCategory.map((c) => (
                    <div key={c.category} className="flex justify-between rounded-lg border border-slate-100 px-3 py-2 text-sm">
                      <span className="font-medium">{c.category}</span>
                      <span className="text-red-700">
                        {formatCurrency(c.cost)} · {c.count} events
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="card">
                <h2 className="mb-4 font-semibold">By employee</h2>
                <div className="space-y-2">
                  {data.waste.byEmployee.map((e) => (
                    <div key={e.name} className="flex justify-between text-sm">
                      <span>{e.name}</span>
                      <span className="font-medium text-red-700">{formatCurrency(e.cost)}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="card lg:col-span-2">
                <h2 className="mb-4 font-semibold">Recent waste log</h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-slate-500">
                        <th className="pb-2">Item</th>
                        <th className="pb-2">Category</th>
                        <th className="pb-2">Reason</th>
                        <th className="pb-2">Employee</th>
                        <th className="pb-2">Cost</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.waste.recent.map((w, i) => (
                        <tr key={i} className="border-b border-slate-100">
                          <td className="py-2">{w.itemName}</td>
                          <td className="py-2">
                            <Badge className="bg-slate-100 text-slate-700">{w.category}</Badge>
                          </td>
                          <td className="py-2 text-slate-600">{w.reason}</td>
                          <td className="py-2">{w.employee ?? "—"}</td>
                          <td className="py-2 font-medium text-red-700">{formatCurrency(w.cost)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
