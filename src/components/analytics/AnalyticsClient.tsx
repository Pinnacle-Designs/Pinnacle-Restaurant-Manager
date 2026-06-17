"use client";

import { useCallback, useEffect, useState } from "react";
import { PageHeader, StatCard, Badge, Button } from "@/components/ui";
import { formatCurrency } from "@/lib/utils";
import { cn } from "@/lib/utils";
import type { AnalyticsPayload } from "@/lib/analytics/types";
import { normalizeAnalyticsPayload } from "@/lib/analytics/normalize";
import { SectionAnalysisPanel } from "@/components/analytics/SectionAnalysisPanel";

const TABS = [
  { id: "executive", label: "Executive" },
  { id: "sales", label: "Sales" },
  { id: "food", label: "Food & Inventory" },
  { id: "labor", label: "Labor" },
  { id: "menu", label: "Menu Engineering" },
  { id: "marketing", label: "Marketing" },
  { id: "customer", label: "Guest Experience" },
  { id: "operations", label: "Operations" },
  { id: "purchasing", label: "Purchasing" },
  { id: "forecasting", label: "Forecasting" },
  { id: "profitability", label: "Profitability" },
  { id: "external", label: "External Factors" },
] as const;

type TabId = (typeof TABS)[number]["id"];

const EXECUTIVE_QUESTIONS = [
  "How did we perform yesterday?",
  "What trends should I watch?",
  "What needs attention today?",
];

function formatHourLabel(hour: number) {
  const suffix = hour >= 12 ? "PM" : "AM";
  const h = hour % 12 === 0 ? 12 : hour % 12;
  return `${h}:00 ${suffix}`;
}

function HourlyBarChart({
  hours,
}: {
  hours: Array<{ hour: number; sales: number; orders: number }>;
}) {
  if (hours.length === 0) return <p className="text-sm text-slate-500">No hourly data yet.</p>;
  const maxOrders = Math.max(...hours.map((h) => h.orders), 1);
  return (
    <div className="space-y-2">
      {hours.map((h) => (
        <div key={h.hour} className="flex items-center gap-3 text-sm">
          <span className="w-16 shrink-0 text-slate-500">{formatHourLabel(h.hour)}</span>
          <div className="h-5 flex-1 rounded bg-slate-100">
            <div
              className="h-full rounded bg-orange-400 transition-all"
              style={{ width: `${(h.orders / maxOrders) * 100}%` }}
            />
          </div>
          <span className="w-20 shrink-0 text-right text-slate-600">{h.orders} orders</span>
          <span className="w-24 shrink-0 text-right font-medium text-slate-800">
            {formatCurrency(h.sales)}
          </span>
        </div>
      ))}
    </div>
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
              <th key={h} className="pb-2 pr-4 font-medium">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-slate-100">
              {row.map((cell, j) => (
                <td key={j} className="py-2 pr-4 text-slate-700">{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function AnalyticsClient() {
  const [data, setData] = useState<AnalyticsPayload | null>(null);
  const [tab, setTab] = useState<TabId>("executive");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [seeding, setSeeding] = useState(false);
  const [weatherSyncing, setWeatherSyncing] = useState(false);

  const loadAnalytics = useCallback(() => {
    setLoading(true);
    setError(null);
    fetch("/api/analytics")
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || `Analytics failed (${r.status})`);
        if (d.error) throw new Error(d.error);
        return normalizeAnalyticsPayload(d);
      })
      .then((d) => setData(d))
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load analytics"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadAnalytics();
  }, [loadAnalytics]);

  const loadSampleData = async () => {
    setSeeding(true);
    setError(null);
    try {
      const res = await fetch("/api/seed", { method: "POST" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Failed to load sample data");
      loadAnalytics();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load sample data");
      setLoading(false);
    } finally {
      setSeeding(false);
    }
  };

  const syncWeather = async () => {
    setWeatherSyncing(true);
    setError(null);
    try {
      const res = await fetch("/api/external/weather/sync", { method: "POST" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Weather sync failed");
      loadAnalytics();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Weather sync failed");
    } finally {
      setWeatherSyncing(false);
    }
  };

  if (loading) return <p className="text-sm text-slate-500">Loading analytics...</p>;
  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4">
        <p className="font-medium text-red-800">Analytics unavailable</p>
        <p className="mt-1 text-sm text-red-700">{error}</p>
        <p className="mt-2 text-sm text-red-600">
          Stop all running dev servers, then run <code className="rounded bg-red-100 px-1">npm run fresh</code> and log in as Owner/Manager.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button size="sm" onClick={loadAnalytics}>Retry</Button>
          <Button size="sm" variant="secondary" onClick={loadSampleData} disabled={seeding}>
            {seeding ? "Loading sample data..." : "Load sample data"}
          </Button>
        </div>
      </div>
    );
  }
  if (!data) return null;

  const e = data.executive;
  const hasSalesData = data.sales.netSales > 0 || data.sales.byMenuItem.length > 0;

  return (
    <div>
      <PageHeader
        title="Analytics"
        description={`Restaurant intelligence — last ${data.periodDays} days`}
      />

      {!hasSalesData && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
          <p className="font-medium text-amber-900">No sales data yet</p>
          <p className="mt-1 text-sm text-amber-800">
            Analytics needs paid orders and inventory. Load sample data to populate charts and AI insights.
          </p>
          <Button className="mt-3" size="sm" onClick={loadSampleData} disabled={seeding}>
            {seeding ? "Loading..." : "Load sample data"}
          </Button>
        </div>
      )}

      <div className="no-print mb-4 flex flex-wrap gap-1 rounded-lg border bg-white p-1">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={cn(
              "rounded-md px-3 py-2 text-xs font-medium transition-colors sm:text-sm",
              tab === id ? "bg-orange-500 text-white" : "text-slate-600 hover:bg-slate-50"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "executive" && (
        <div className="space-y-6">
          <div>
            <h2 className="mb-3 font-semibold text-slate-900">Yesterday</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <StatCard label="Sales" value={formatCurrency(e.yesterday.sales)} />
              <StatCard label="Net Sales" value={formatCurrency(e.yesterday.netSales)} />
              <StatCard label="Food Cost %" value={`${e.yesterday.foodCostPct.toFixed(1)}%`} />
              <StatCard label="Labor %" value={`${e.yesterday.laborPct.toFixed(1)}%`} />
              <StatCard label="Prime Cost %" value={`${e.yesterday.primeCostPct.toFixed(1)}%`} />
              <StatCard label="Profit Est." value={formatCurrency(e.yesterday.profitEstimate)} />
              <StatCard label="Guests" value={e.yesterday.guestCount} />
            </div>
          </div>

          <div className="card">
            <h2 className="font-semibold">Last 7 Days Trends</h2>
            <DataTable
              headers={["Date", "Sales", "Profit Est.", "Avg Rating"]}
              rows={e.last7Days.salesTrend.map((s, i) => [
                s.date,
                formatCurrency(s.sales),
                formatCurrency(e.last7Days.profitTrend[i]?.profit ?? 0),
                e.last7Days.reviewTrend[i]?.avgRating.toFixed(1) ?? "—",
              ])}
            />
          </div>

          {e.alerts.length > 0 && (
            <div className="card border-amber-200 bg-amber-50">
              <h2 className="font-semibold text-amber-900">Alerts</h2>
              <ul className="mt-3 space-y-2">
                {e.alerts.map((a) => (
                  <li key={a.message} className="text-sm text-amber-800">• {a.message}</li>
                ))}
              </ul>
            </div>
          )}

          <SectionAnalysisPanel
            section="executive"
            questions={EXECUTIVE_QUESTIONS}
            initialInsights={data.aiInsights}
          />
        </div>
      )}

      {tab === "sales" && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Total Sales" value={formatCurrency(data.sales.totalSales)} />
            <StatCard label="Net Sales" value={formatCurrency(data.sales.netSales)} />
            <StatCard label="Avg Check" value={formatCurrency(data.sales.averageCheck)} />
            <StatCard label="Avg / Guest" value={formatCurrency(data.sales.averageSpendPerGuest)} />
            <StatCard label="Guests" value={data.sales.guestCount} />
            <StatCard label="Rev / Seat" value={formatCurrency(data.sales.revenuePerSeat)} />
            <StatCard label="Rev / Labor Hr" value={formatCurrency(data.sales.revenuePerLaborHour)} />
            <StatCard label="Rev / Sq Ft" value={formatCurrency(data.sales.revenuePerSqFt)} />
          </div>

          <div className="card border-orange-100 bg-orange-50/50">
            <h3 className="font-semibold text-slate-900">Sales Intelligence</h3>
            <div className="mt-3 grid gap-4 sm:grid-cols-3">
              <div>
                <p className="text-xs font-medium uppercase text-slate-400">What sells?</p>
                <p className="mt-1 text-sm font-medium text-slate-800">
                  {data.sales.highlights.topSellingItem
                    ? `${data.sales.highlights.topSellingItem.name} ($${data.sales.highlights.topSellingItem.sales.toFixed(0)})`
                    : "—"}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase text-slate-400">When busiest?</p>
                <p className="mt-1 text-sm font-medium text-slate-800">
                  {data.sales.highlights.busiestDaypart && data.sales.highlights.busiestHour
                    ? `${data.sales.highlights.busiestDaypart.daypart}, ${formatHourLabel(data.sales.highlights.busiestHour.hour)}`
                    : "—"}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase text-slate-400">Most profitable channel</p>
                <p className="mt-1 text-sm font-medium text-slate-800">
                  {data.sales.highlights.mostProfitableChannel
                    ? `${data.sales.highlights.mostProfitableChannel.channel} (${data.sales.highlights.mostProfitableChannel.marginPct.toFixed(1)}% margin)`
                    : "—"}
                </p>
              </div>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="card">
              <h3 className="font-semibold">By Daypart</h3>
              <DataTable
                headers={["Daypart", "Net Sales", "Orders"]}
                rows={data.sales.byDaypart.map((d) => [d.daypart, formatCurrency(d.sales), d.orders])}
              />
            </div>
            <div className="card">
              <h3 className="font-semibold">By Channel</h3>
              <DataTable
                headers={["Channel", "Net Sales", "Profit", "Margin", "Orders"]}
                rows={data.sales.byChannel.map((c) => [
                  c.channel,
                  formatCurrency(c.sales),
                  formatCurrency(c.profit),
                  `${c.marginPct.toFixed(1)}%`,
                  c.orders,
                ])}
              />
            </div>
            <div className="card lg:col-span-2">
              <h3 className="font-semibold">Sales by Hour</h3>
              <p className="mb-3 text-sm text-slate-500">When are we busiest? Peak hours drive staffing and prep.</p>
              <HourlyBarChart hours={data.sales.byHour} />
            </div>
            <div className="card">
              <h3 className="font-semibold">Top Menu Items</h3>
              <DataTable
                headers={["Item", "Sales", "Qty"]}
                rows={data.sales.byMenuItem.map((i) => [i.name, formatCurrency(i.sales), i.quantity])}
              />
            </div>
            <div className="card">
              <h3 className="font-semibold">By Category</h3>
              <DataTable
                headers={["Category", "Sales", "Qty"]}
                rows={data.sales.byCategory.map((c) => [c.category, formatCurrency(c.sales), c.quantity])}
              />
            </div>
          </div>
          <SectionAnalysisPanel section="sales" questions={data.sales.questions} />
        </div>
      )}

      {tab === "food" && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Food Cost %" value={`${data.foodCost.foodCostPct.toFixed(1)}%`} subtext="Critical metric" />
            <StatCard label="Variance" value={`${data.foodCost.variancePct.toFixed(1)}%`} subtext="Theoretical vs actual" />
            <StatCard label="Inventory Turnover" value={data.foodCost.inventoryTurnover.toFixed(2)} subtext="Critical metric" />
            <StatCard label="Days on Hand" value={data.foodCost.daysOnHand.toFixed(0)} subtext="Critical metric" />
            <StatCard label="Theoretical FC" value={formatCurrency(data.foodCost.theoreticalFoodCost)} />
            <StatCard label="Actual FC" value={formatCurrency(data.foodCost.actualFoodCost)} />
            <StatCard label="Inventory Value" value={formatCurrency(data.foodCost.inventoryValuation)} />
            <StatCard label="Waste" value={formatCurrency(data.foodCost.wasteCost)} />
            <StatCard label="Spoilage" value={formatCurrency(data.foodCost.spoilageCost)} />
            <StatCard label="Theoretical %" value={`${data.foodCost.theoreticalFoodCostPct.toFixed(1)}%`} />
          </div>

          <div className="card border-blue-100 bg-blue-50/50">
            <h3 className="font-semibold text-slate-900">Food Cost Intelligence</h3>
            <p className="mt-1 text-sm text-slate-500">Answers to the key food cost questions — use Run Analysis for deeper AI recommendations.</p>
            <div className="mt-4 grid gap-4 lg:grid-cols-3">
              <div className="rounded-lg border border-blue-100 bg-white p-4">
                <p className="text-xs font-semibold uppercase text-blue-600">Where is product disappearing?</p>
                <p className="mt-2 text-sm font-medium text-slate-800">
                  Primary cause: {data.foodCost.highlights.productDisappearing.primaryCause}
                </p>
                <p className="mt-1 text-sm text-slate-600">
                  Waste {formatCurrency(data.foodCost.highlights.productDisappearing.wasteCost)} · Spoilage{" "}
                  {formatCurrency(data.foodCost.highlights.productDisappearing.spoilageCost)} · Variance gap{" "}
                  {data.foodCost.highlights.productDisappearing.varianceGapPct.toFixed(1)}%
                </p>
              </div>
              <div className="rounded-lg border border-blue-100 bg-white p-4">
                <p className="text-xs font-semibold uppercase text-blue-600">Which items drive food cost increases?</p>
                <p className="mt-2 text-sm font-medium text-slate-800">
                  {data.foodCost.highlights.costIncreaseDrivers.length > 0
                    ? data.foodCost.highlights.costIncreaseDrivers
                        .slice(0, 3)
                        .map((d) => `${d.name} (+${d.changePct.toFixed(1)}%)`)
                        .join(", ")
                    : "No major vendor price increases this period"}
                </p>
                {data.foodCost.highlights.vendorWithHighestIncrease && (
                  <p className="mt-1 text-sm text-slate-600">
                    Biggest vendor hike: {data.foodCost.highlights.vendorWithHighestIncrease.vendor} (+
                    {data.foodCost.highlights.vendorWithHighestIncrease.changePct.toFixed(1)}%)
                  </p>
                )}
              </div>
              <div className="rounded-lg border border-blue-100 bg-white p-4">
                <p className="text-xs font-semibold uppercase text-blue-600">Are recipes being followed?</p>
                <p className="mt-2 text-sm font-medium text-slate-800">
                  {data.foodCost.highlights.recipeCompliance.status === "on_track"
                    ? "On track"
                    : data.foodCost.highlights.recipeCompliance.status === "drift"
                      ? "Drift detected — investigate portions"
                      : "Favorable — below theoretical"}
                </p>
                <p className="mt-1 text-sm text-slate-600">
                  Theoretical {data.foodCost.highlights.recipeCompliance.theoreticalPct.toFixed(1)}% vs actual{" "}
                  {data.foodCost.highlights.recipeCompliance.actualPct.toFixed(1)}%
                  {data.foodCost.highlights.recipeCompliance.topDriftItem
                    ? ` · Watch ${data.foodCost.highlights.recipeCompliance.topDriftItem}`
                    : ""}
                </p>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-500">
              <span className="rounded-full bg-white px-2 py-1">Inventory counts</span>
              <span className="rounded-full bg-white px-2 py-1">Valuation</span>
              <span className="rounded-full bg-white px-2 py-1">Theoretical & actual FC</span>
              <span className="rounded-full bg-white px-2 py-1">Waste & spoilage</span>
              <span className="rounded-full bg-white px-2 py-1">Pricing changes</span>
              <span className="rounded-full bg-white px-2 py-1">Recipe & portion costs</span>
              <span className="rounded-full bg-white px-2 py-1">Yield %</span>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="card">
              <h3 className="font-semibold">Inventory Counts</h3>
              <DataTable
                headers={["Item", "Qty", "Value", "Yield %"]}
                rows={data.foodCost.inventoryCounts.map((i) => [
                  i.name,
                  `${i.quantity} ${i.unit}`,
                  formatCurrency(i.valuation),
                  `${i.yieldPct.toFixed(0)}%`,
                ])}
              />
            </div>
            <div className="card">
              <h3 className="font-semibold">Portion & Yield Costs</h3>
              <DataTable
                headers={["Item", "Cost/Unit", "Portion", "Portion Cost", "Yield"]}
                rows={data.foodCost.inventoryCounts
                  .filter((i) => i.portionCost !== null)
                  .map((i) => [
                    i.name,
                    formatCurrency(i.costPerUnit),
                    i.portionSize ? `${i.portionSize} ${i.unit}` : "—",
                    i.portionCost ? formatCurrency(i.portionCost) : "—",
                    `${i.yieldPct.toFixed(0)}%`,
                  ])}
              />
            </div>
            <div className="card">
              <h3 className="font-semibold">Recipe Costs</h3>
              <DataTable
                headers={["Menu Item", "Price", "Recipe Cost", "FC %"]}
                rows={data.foodCost.recipeCosts.map((r) => [
                  r.name,
                  formatCurrency(r.price),
                  formatCurrency(r.recipeCost),
                  `${r.recipeCostPct.toFixed(1)}%`,
                ])}
              />
            </div>
            <div className="card">
              <h3 className="font-semibold">Waste & Spoilage</h3>
              <DataTable
                headers={["Reason", "Cost", "Qty"]}
                rows={data.foodCost.wasteByReason.map((w) => [
                  w.reason,
                  formatCurrency(w.cost),
                  w.quantity.toFixed(1),
                ])}
              />
            </div>
            <div className="card">
              <h3 className="font-semibold">Vendor Price Changes</h3>
              <DataTable
                headers={["Vendor", "Category", "Latest Δ%"]}
                rows={data.foodCost.pricingChanges.map((p) => [
                  p.vendor,
                  p.category,
                  `${p.latestChangePct >= 0 ? "+" : ""}${p.latestChangePct.toFixed(1)}%`,
                ])}
              />
            </div>
            <div className="card">
              <h3 className="font-semibold">Vendor Comparison</h3>
              <DataTable
                headers={["Item", "Current", "Cheapest", "Savings"]}
                rows={data.foodCost.vendorComparison.map((v) => [
                  v.itemName,
                  v.currentVendor ?? "—",
                  `${v.cheapestVendor} (${formatCurrency(v.cheapestPrice)})`,
                  `${v.potentialSavingsPct.toFixed(1)}%`,
                ])}
              />
            </div>
            <div className="card lg:col-span-2">
              <h3 className="font-semibold">Pricing Over Time</h3>
              <DataTable
                headers={["Vendor", "Date", "Amount", "Unit Price", "Change %"]}
                rows={data.foodCost.pricingChanges.flatMap((p) =>
                  p.trend.slice(-4).map((t) => [
                    p.vendor,
                    t.date,
                    t.amount ? formatCurrency(t.amount) : "—",
                    t.unitPrice ? formatCurrency(t.unitPrice) : "—",
                    t.changePct ? `${t.changePct.toFixed(1)}%` : "—",
                  ])
                )}
              />
            </div>
            <div className="card">
              <h3 className="font-semibold">Top Cost Drivers</h3>
              <DataTable
                headers={["Item", "Value", "Price Δ%"]}
                rows={data.foodCost.topCostDrivers.map((i) => [i.name, formatCurrency(i.cost), `${i.changePct.toFixed(1)}%`])}
              />
            </div>
            <div className="card">
              <h3 className="font-semibold">Low Stock</h3>
              <DataTable
                headers={["Item", "Qty", "Min"]}
                rows={data.foodCost.lowStockItems.map((i) => [i.name, i.quantity, i.minQuantity])}
              />
            </div>
          </div>
          <SectionAnalysisPanel section="food" questions={data.foodCost.questions} />
        </div>
      )}

      {tab === "labor" && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <StatCard label="Labor %" value={`${data.labor.laborPct.toFixed(1)}%`} subtext="Critical metric" />
            <StatCard label="Sales / Labor Hr" value={formatCurrency(data.labor.salesPerLaborHour)} subtext="Critical metric" />
            <StatCard label="Guests / Labor Hr" value={data.labor.guestsPerLaborHour.toFixed(1)} subtext="Critical metric" />
            <StatCard label="Overtime %" value={`${data.labor.overtimePct.toFixed(1)}%`} subtext="Critical metric" />
            <StatCard
              label="Labor Variance"
              value={`${data.labor.laborVarianceHours.toFixed(1)} hrs`}
              subtext={`${data.labor.laborVariancePct.toFixed(1)}% scheduled vs actual`}
            />
            <StatCard label="Scheduled Hrs" value={data.labor.scheduledHours.toFixed(0)} />
            <StatCard label="Actual Hrs" value={data.labor.actualHours.toFixed(0)} />
            <StatCard label="Overtime Hrs" value={data.labor.overtimeHours.toFixed(1)} />
            <StatCard label="Labor Cost" value={formatCurrency(data.labor.laborCost)} />
          </div>

          <div className="card border-blue-100 bg-blue-50/50">
            <h3 className="font-semibold text-slate-900">Labor Intelligence</h3>
            <p className="mt-1 text-sm text-slate-500">Answers to key labor questions — use Run Analysis for deeper AI recommendations.</p>
            <div className="mt-4 grid gap-4 lg:grid-cols-3">
              <div className="rounded-lg border border-blue-100 bg-white p-4">
                <p className="text-xs font-semibold uppercase text-blue-600">Are we overstaffed or understaffed?</p>
                <p className="mt-2 text-sm font-medium capitalize text-slate-800">
                  {data.labor.highlights.staffingStatus}
                </p>
                <p className="mt-1 text-sm text-slate-600">{data.labor.highlights.staffingReason}</p>
              </div>
              <div className="rounded-lg border border-blue-100 bg-white p-4">
                <p className="text-xs font-semibold uppercase text-blue-600">Which shifts are inefficient?</p>
                <p className="mt-2 text-sm font-medium text-slate-800">
                  {data.labor.highlights.inefficientShifts.length > 0
                    ? data.labor.highlights.inefficientShifts
                        .slice(0, 2)
                        .map((s) => `${s.label} ($${s.salesPerLaborHour.toFixed(0)}/hr)`)
                        .join(", ")
                    : "All shifts within targets"}
                </p>
                <p className="mt-1 text-sm text-slate-600">Lowest sales per labor hour dayparts need schedule review.</p>
              </div>
              <div className="rounded-lg border border-blue-100 bg-white p-4">
                <p className="text-xs font-semibold uppercase text-blue-600">Which employees produce the best results?</p>
                <p className="mt-2 text-sm font-medium text-slate-800">
                  {data.labor.highlights.topPerformers.length > 0
                    ? data.labor.highlights.topPerformers
                        .slice(0, 3)
                        .map((e) => `${e.name} ($${e.salesPerLaborHour.toFixed(0)}/hr)`)
                        .join(", ")
                    : "No shift data yet"}
                </p>
                <p className="mt-1 text-sm text-slate-600">Ranked by attributed sales per labor hour.</p>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-500">
              <span className="rounded-full bg-white px-2 py-1">Scheduled hours</span>
              <span className="rounded-full bg-white px-2 py-1">Actual hours</span>
              <span className="rounded-full bg-white px-2 py-1">Overtime</span>
              <span className="rounded-full bg-white px-2 py-1">Cost by position</span>
              <span className="rounded-full bg-white px-2 py-1">Cost by shift</span>
              <span className="rounded-full bg-white px-2 py-1">Cost by sales hour</span>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="card">
              <h3 className="font-semibold">Labor Cost by Position</h3>
              <DataTable
                headers={["Role", "Hours", "Cost"]}
                rows={data.labor.byPosition.map((p) => [p.role, p.hours.toFixed(1), formatCurrency(p.cost)])}
              />
            </div>
            <div className="card">
              <h3 className="font-semibold">Labor Cost by Shift</h3>
              <DataTable
                headers={["Shift", "Hours", "Labor Cost", "Sales", "Sales/Labor Hr"]}
                rows={data.labor.byShift.map((s) => [
                  s.label,
                  s.hours.toFixed(0),
                  formatCurrency(s.laborCost),
                  formatCurrency(s.sales),
                  formatCurrency(s.salesPerLaborHour),
                ])}
              />
            </div>
            <div className="card lg:col-span-2">
              <h3 className="font-semibold">Labor Cost by Sales Hour</h3>
              <p className="mb-3 text-sm text-slate-500">Staffing vs revenue by hour — spot over- and under-staffed periods.</p>
              <DataTable
                headers={["Hour", "Labor Hrs", "Labor Cost", "Sales", "Sales/Labor Hr"]}
                rows={data.labor.bySalesHour.map((h) => [
                  h.label,
                  h.laborHours.toFixed(1),
                  formatCurrency(h.laborCost),
                  formatCurrency(h.sales),
                  formatCurrency(h.salesPerLaborHour),
                ])}
              />
            </div>
            <div className="card lg:col-span-2">
              <h3 className="font-semibold">Employee Productivity</h3>
              <DataTable
                headers={["Employee", "Role", "Sched Hrs", "Actual Hrs", "Sales Attr.", "Sales/Labor Hr", "Guests/Hr"]}
                rows={data.labor.byEmployee.map((e) => [
                  e.name,
                  e.role,
                  e.scheduledHours.toFixed(1),
                  e.actualHours.toFixed(1),
                  formatCurrency(e.salesAttributed),
                  formatCurrency(e.salesPerLaborHour),
                  e.guestsPerLaborHour.toFixed(1),
                ])}
              />
            </div>
          </div>
          <SectionAnalysisPanel section="labor" questions={data.labor.questions} />
        </div>
      )}

      {tab === "menu" && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Stars" value={data.menuEngineering.stars} subtext="High profit, high popularity" />
            <StatCard label="Plowhorses" value={data.menuEngineering.plowhorses} subtext="Low profit, high popularity" />
            <StatCard label="Puzzles" value={data.menuEngineering.puzzles} subtext="High profit, low popularity" />
            <StatCard label="Dogs" value={data.menuEngineering.dogs} subtext="Low profit, low popularity" />
            <StatCard label="Items Sold" value={data.menuEngineering.totalItemsSold} />
            <StatCard label="Total Contribution" value={formatCurrency(data.menuEngineering.totalContribution)} />
            <StatCard label="Avg Popularity" value={`${data.menuEngineering.avgPopularityPct.toFixed(1)}%`} subtext="Classification threshold" />
            <StatCard label="Avg Margin" value={`${data.menuEngineering.avgMarginPct.toFixed(1)}%`} subtext="Classification threshold" />
          </div>

          <div className="card border-blue-100 bg-blue-50/50">
            <h3 className="font-semibold text-slate-900">Menu Engineering Intelligence</h3>
            <p className="mt-1 text-sm text-slate-500">Answers to key menu questions — use Run Analysis for deeper AI recommendations.</p>
            <div className="mt-4 grid gap-4 lg:grid-cols-3">
              <div className="rounded-lg border border-blue-100 bg-white p-4">
                <p className="text-xs font-semibold uppercase text-blue-600">What should we promote?</p>
                <p className="mt-2 text-sm font-medium text-slate-800">
                  {data.menuEngineering.highlights.promoteItems.length > 0
                    ? data.menuEngineering.highlights.promoteItems
                        .slice(0, 3)
                        .map((i) => `${i.name} (${i.quadrant})`)
                        .join(", ")
                    : "No promotion candidates yet"}
                </p>
                <p className="mt-1 text-sm text-slate-600">Stars and puzzles — feature on menu, specials, and staff picks.</p>
              </div>
              <div className="rounded-lg border border-blue-100 bg-white p-4">
                <p className="text-xs font-semibold uppercase text-blue-600">What should we reprice?</p>
                <p className="mt-2 text-sm font-medium text-slate-800">
                  {data.menuEngineering.highlights.repriceItems.length > 0
                    ? data.menuEngineering.highlights.repriceItems
                        .slice(0, 3)
                        .map((i) => `${i.name} (${i.marginPct.toFixed(0)}% margin)`)
                        .join(", ")
                    : "No reprice candidates"}
                </p>
                <p className="mt-1 text-sm text-slate-600">Plowhorses — popular but thin margins; small price lifts help.</p>
              </div>
              <div className="rounded-lg border border-blue-100 bg-white p-4">
                <p className="text-xs font-semibold uppercase text-blue-600">What should we remove?</p>
                <p className="mt-2 text-sm font-medium text-slate-800">
                  {data.menuEngineering.highlights.removeItems.length > 0
                    ? data.menuEngineering.highlights.removeItems
                        .slice(0, 3)
                        .map((i) => i.name)
                        .join(", ")
                    : "No removal candidates"}
                </p>
                <p className="mt-1 text-sm text-slate-600">Dogs — low profit and low popularity; simplify the menu.</p>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-500">
              <span className="rounded-full bg-white px-2 py-1">Sales volume</span>
              <span className="rounded-full bg-white px-2 py-1">Contribution margin</span>
              <span className="rounded-full bg-white px-2 py-1">Popularity</span>
              <span className="rounded-full bg-white px-2 py-1">Recipe cost</span>
              <span className="rounded-full bg-white px-2 py-1">Menu mix</span>
              <span className="rounded-full bg-white px-2 py-1">BCG classification</span>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="card">
              <h3 className="font-semibold">Menu Mix by Category</h3>
              <DataTable
                headers={["Category", "Sales", "Mix %", "Qty", "Contribution"]}
                rows={data.menuEngineering.menuMix.map((c) => [
                  c.category,
                  formatCurrency(c.sales),
                  `${c.mixPct.toFixed(1)}%`,
                  c.quantity,
                  formatCurrency(c.contribution),
                ])}
              />
            </div>
            <div className="card">
              <h3 className="font-semibold">Quadrant Breakdown</h3>
              <DataTable
                headers={["Quadrant", "Count", "Top Item"]}
                rows={[
                  ["Stars", data.menuEngineering.byQuadrant.star.length, data.menuEngineering.byQuadrant.star[0]?.name ?? "—"],
                  ["Plowhorses", data.menuEngineering.byQuadrant.plowhorse.length, data.menuEngineering.byQuadrant.plowhorse[0]?.name ?? "—"],
                  ["Puzzles", data.menuEngineering.byQuadrant.puzzle.length, data.menuEngineering.byQuadrant.puzzle[0]?.name ?? "—"],
                  ["Dogs", data.menuEngineering.byQuadrant.dog.length, data.menuEngineering.byQuadrant.dog[0]?.name ?? "—"],
                ]}
              />
            </div>
            <div className="card lg:col-span-2">
              <h3 className="font-semibold">Menu Engineering Matrix</h3>
              <p className="mb-3 text-sm text-slate-500">
                Items classified vs avg popularity ({data.menuEngineering.avgPopularityPct.toFixed(1)}%) and avg margin ({data.menuEngineering.avgMarginPct.toFixed(1)}%).
              </p>
              <DataTable
                headers={["Item", "Quadrant", "Price", "Recipe Cost", "Margin %", "Popularity %", "Sold", "Contribution"]}
                rows={data.menuEngineering.items.map((m) => [
                  m.name,
                  m.quadrant.toUpperCase(),
                  formatCurrency(m.price),
                  formatCurrency(m.recipeCost),
                  `${m.marginPct.toFixed(0)}%`,
                  `${m.popularityPct.toFixed(1)}%`,
                  m.quantitySold,
                  formatCurrency(m.contribution),
                ])}
              />
            </div>
          </div>
          <SectionAnalysisPanel section="menu" questions={data.menuEngineering.questions} />
        </div>
      )}

      {tab === "marketing" && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Marketing Spend" value={formatCurrency(data.marketing.totalSpend)} />
            <StatCard label="CAC" value={formatCurrency(data.marketing.customerAcquisitionCost)} subtext="Critical metric" />
            <StatCard label="ROAS" value={`${data.marketing.returnOnAdSpend.toFixed(1)}x`} subtext="Critical metric" />
            <StatCard label="LTV Est." value={formatCurrency(data.marketing.lifetimeValueEstimate)} subtext="Critical metric" />
            <StatCard label="Repeat Visit Rate" value={`${data.marketing.repeatVisitRate.toFixed(0)}%`} subtext="Critical metric" />
            <StatCard label="New Guests" value={data.marketing.newGuests} />
            <StatCard label="Returning Guests" value={data.marketing.returningGuests} />
            <StatCard label="Social Followers" value={data.marketing.socialMedia.totalFollowers} />
          </div>

          <div className="card border-blue-100 bg-blue-50/50">
            <h3 className="font-semibold text-slate-900">Marketing Intelligence</h3>
            <p className="mt-1 text-sm text-slate-500">Answers to key marketing questions — use Run Analysis for deeper AI recommendations.</p>
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <div className="rounded-lg border border-blue-100 bg-white p-4">
                <p className="text-xs font-semibold uppercase text-blue-600">Is marketing actually generating sales?</p>
                <p className="mt-2 text-sm font-medium capitalize text-slate-800">
                  {data.marketing.highlights.salesGenerating.status === "yes"
                    ? "Yes — driving attributed revenue"
                    : data.marketing.highlights.salesGenerating.status === "weak"
                      ? "Weak — revenue below target ROAS"
                      : "Insufficient data"}
                </p>
                <p className="mt-1 text-sm text-slate-600">{data.marketing.highlights.salesGenerating.reason}</p>
              </div>
              <div className="rounded-lg border border-blue-100 bg-white p-4">
                <p className="text-xs font-semibold uppercase text-blue-600">Which channels bring profitable customers?</p>
                <p className="mt-2 text-sm font-medium text-slate-800">
                  {data.marketing.highlights.profitableChannels.length > 0
                    ? data.marketing.highlights.profitableChannels
                        .slice(0, 3)
                        .map((c) => `${c.channel} (${c.marginPct.toFixed(0)}% margin)`)
                        .join(", ")
                    : "No channel data yet"}
                </p>
                <p className="mt-1 text-sm text-slate-600">Ranked by gross profit from order channels.</p>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-500">
              <span className="rounded-full bg-white px-2 py-1">Campaign performance</span>
              <span className="rounded-full bg-white px-2 py-1">Coupon usage</span>
              <span className="rounded-full bg-white px-2 py-1">Email performance</span>
              <span className="rounded-full bg-white px-2 py-1">Social engagement</span>
              <span className="rounded-full bg-white px-2 py-1">Website traffic</span>
              <span className="rounded-full bg-white px-2 py-1">Google Business</span>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="card">
              <h3 className="font-semibold">Campaign Performance</h3>
              <DataTable
                headers={["Campaign", "Channel", "Spend", "Clicks", "Conv.", "Revenue", "ROAS"]}
                rows={data.marketing.campaigns.map((c) => [
                  c.name,
                  c.channel,
                  formatCurrency(c.spend),
                  c.clicks,
                  c.conversions,
                  formatCurrency(c.revenue),
                  `${c.roas.toFixed(1)}x`,
                ])}
              />
            </div>
            <div className="card">
              <h3 className="font-semibold">Channel Profitability</h3>
              <DataTable
                headers={["Channel", "Profit", "Margin", "Orders", "Mkt Spend", "ROAS"]}
                rows={data.marketing.highlights.profitableChannels.map((c) => [
                  c.channel,
                  formatCurrency(c.profit),
                  `${c.marginPct.toFixed(1)}%`,
                  c.orders,
                  c.marketingSpend > 0 ? formatCurrency(c.marketingSpend) : "—",
                  c.marketingSpend > 0 ? `${c.roas.toFixed(1)}x` : "—",
                ])}
              />
            </div>
            <div className="card">
              <h3 className="font-semibold">Coupon Usage</h3>
              <DataTable
                headers={["Metric", "Value"]}
                rows={[
                  ["Orders with discount", data.marketing.couponUsage.ordersWithCoupon],
                  ["Coupon rate", `${data.marketing.couponUsage.couponRatePct.toFixed(1)}%`],
                  ["Total discounts", formatCurrency(data.marketing.couponUsage.totalDiscount)],
                  ["Avg discount", formatCurrency(data.marketing.couponUsage.avgDiscount)],
                ]}
              />
            </div>
            <div className="card">
              <h3 className="font-semibold">Email Performance</h3>
              <DataTable
                headers={["Metric", "Value"]}
                rows={[
                  ["Campaigns", data.marketing.emailPerformance.campaigns],
                  ["Spend", formatCurrency(data.marketing.emailPerformance.spend)],
                  ["Clicks", data.marketing.emailPerformance.clicks],
                  ["Conversions", data.marketing.emailPerformance.conversions],
                  ["Revenue", formatCurrency(data.marketing.emailPerformance.revenue)],
                  ["ROAS", `${data.marketing.emailPerformance.roas.toFixed(1)}x`],
                ]}
              />
            </div>
            <div className="card">
              <h3 className="font-semibold">Social Media</h3>
              <DataTable
                headers={["Platform", "Followers", "Posts"]}
                rows={data.marketing.socialMedia.accounts.map((a) => [
                  a.platform,
                  a.followers,
                  a.postsPublished,
                ])}
              />
            </div>
            <div className="card">
              <h3 className="font-semibold">Google Business</h3>
              <DataTable
                headers={["Metric", "Value"]}
                rows={[
                  ["Reviews", data.marketing.googleBusiness.reviewCount],
                  ["Avg rating", data.marketing.googleBusiness.avgRating.toFixed(1)],
                  ["Profile views (30d)", data.marketing.googleBusiness.profileViews30d],
                  ["Direction requests", data.marketing.googleBusiness.directionRequests],
                ]}
              />
            </div>
            {data.marketing.websiteTraffic && (
              <div className="card lg:col-span-2">
                <h3 className="font-semibold">Website Traffic</h3>
                <p className="mb-3 text-sm text-slate-500">{data.marketing.websiteTraffic.url}</p>
                <DataTable
                  headers={["Metric", "Value"]}
                  rows={[
                    ["Visitors (30d)", data.marketing.websiteTraffic.visitors30d],
                    ["Page views (30d)", data.marketing.websiteTraffic.pageViews30d],
                    ["Sessions (30d)", data.marketing.websiteTraffic.sessions30d],
                    ["Bounce rate", `${data.marketing.websiteTraffic.bounceRate.toFixed(1)}%`],
                    ...data.marketing.websiteTraffic.topReferrers.map((r) => [
                      `Referrer: ${r.source}`,
                      `${r.pct}%`,
                    ]),
                  ]}
                />
              </div>
            )}
          </div>
          <SectionAnalysisPanel section="marketing" questions={data.marketing.questions} />
        </div>
      )}

      {tab === "customer" && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Avg Rating" value={`${data.customerExperience.avgRating.toFixed(1)}★`} />
            <StatCard label="Reviews" value={data.customerExperience.reviewCount} />
            <StatCard label="Unresolved" value={data.customerExperience.unresolvedCount} />
            <StatCard
              label="Sentiment"
              value={data.customerExperience.highlights.sentimentSummary.overall}
              subtext={`${data.customerExperience.sentiment.positive} positive / ${data.customerExperience.sentiment.negative} negative`}
            />
            <StatCard
              label="Avg Resolution"
              value={`${data.customerExperience.resolutionTimes.avgDaysToResolve.toFixed(1)} days`}
            />
            <StatCard
              label="Open Issues Age"
              value={`${data.customerExperience.resolutionTimes.unresolvedAvgDays.toFixed(1)} days`}
              subtext="Unresolved complaints"
            />
          </div>

          <div className="card border-blue-100 bg-blue-50/50">
            <h3 className="font-semibold text-slate-900">Guest Experience Intelligence</h3>
            <p className="mt-1 text-sm text-slate-500">Answers to key guest experience questions — use Run Analysis for deeper AI recommendations.</p>
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <div className="rounded-lg border border-blue-100 bg-white p-4">
                <p className="text-xs font-semibold uppercase text-blue-600">What is hurting guest satisfaction?</p>
                <p className="mt-2 text-sm font-medium text-slate-800">
                  {data.customerExperience.highlights.satisfactionHurts.length > 0
                    ? data.customerExperience.highlights.satisfactionHurts
                        .slice(0, 3)
                        .map((s) => `${s.issue} (${s.avgRating.toFixed(1)}★)`)
                        .join(", ")
                    : "No dominant issues detected"}
                </p>
                <p className="mt-1 text-sm text-slate-600">Top complaint categories and low-rated review sources.</p>
              </div>
              <div className="rounded-lg border border-blue-100 bg-white p-4">
                <p className="text-xs font-semibold uppercase text-blue-600">Which shifts create complaints?</p>
                <p className="mt-2 text-sm font-medium text-slate-800">
                  {data.customerExperience.highlights.complaintHotspots.length > 0
                    ? data.customerExperience.highlights.complaintHotspots
                        .slice(0, 3)
                        .map((s) => `${s.label} (${s.count})`)
                        .join(", ")
                    : "No shift pattern yet"}
                </p>
                <p className="mt-1 text-sm text-slate-600">Daypart breakdown of negative reviews and complaint categories.</p>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-500">
              <span className="rounded-full bg-white px-2 py-1">Reviews & star ratings</span>
              <span className="rounded-full bg-white px-2 py-1">Survey results</span>
              <span className="rounded-full bg-white px-2 py-1">Complaint categories</span>
              <span className="rounded-full bg-white px-2 py-1">Resolution times</span>
              <span className="rounded-full bg-white px-2 py-1">Guest sentiment</span>
              <span className="rounded-full bg-white px-2 py-1">Google & OpenTable</span>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="card">
              <h3 className="font-semibold">Star Rating Distribution</h3>
              <DataTable
                headers={["Stars", "Count", "Share"]}
                rows={data.customerExperience.starDistribution.map((s) => [
                  `${s.stars}★`,
                  s.count,
                  `${s.pct.toFixed(0)}%`,
                ])}
              />
            </div>
            <div className="card">
              <h3 className="font-semibold">Survey Results by Category</h3>
              <DataTable
                headers={["Category", "Responses", "Avg Score", "Satisfied %"]}
                rows={data.customerExperience.surveyResults.map((s) => [
                  s.category,
                  s.responses,
                  s.avgScore.toFixed(1),
                  `${s.satisfiedPct.toFixed(0)}%`,
                ])}
              />
            </div>
            <div className="card">
              <h3 className="font-semibold">Complaint Categories</h3>
              <DataTable
                headers={["Category", "Count"]}
                rows={data.customerExperience.complaintCategories.map((c) => [c.category, c.count])}
              />
            </div>
            <div className="card">
              <h3 className="font-semibold">Complaints by Shift / Daypart</h3>
              <DataTable
                headers={["Daypart", "Negative Reviews", "Avg Rating", "Top Issue"]}
                rows={data.customerExperience.complaintsByDaypart.map((d) => [
                  d.daypart,
                  d.negativeCount,
                  d.avgRating > 0 ? `${d.avgRating.toFixed(1)}★` : "—",
                  d.topCategory ?? "—",
                ])}
              />
            </div>
            <div className="card">
              <h3 className="font-semibold">Google Reviews</h3>
              <p className="mb-2 text-sm text-slate-500">
                {data.customerExperience.googleReviews.count} reviews · {data.customerExperience.googleReviews.avgRating.toFixed(1)}★ ·{" "}
                {data.customerExperience.googleReviews.unresolved} unresolved
              </p>
              <ul className="space-y-2">
                {data.customerExperience.googleReviews.recent.map((r, i) => (
                  <li key={i} className="rounded border p-2 text-sm">
                    {r.rating}★ {r.comment && <span className="text-slate-600">— {r.comment}</span>}
                  </li>
                ))}
              </ul>
            </div>
            <div className="card">
              <h3 className="font-semibold">OpenTable Reviews</h3>
              <p className="mb-2 text-sm text-slate-500">
                {data.customerExperience.openTableReviews.count} reviews · {data.customerExperience.openTableReviews.avgRating.toFixed(1)}★ ·{" "}
                {data.customerExperience.openTableReviews.unresolved} unresolved
              </p>
              <ul className="space-y-2">
                {data.customerExperience.openTableReviews.recent.map((r, i) => (
                  <li key={i} className="rounded border p-2 text-sm">
                    {r.rating}★ {r.comment && <span className="text-slate-600">— {r.comment}</span>}
                  </li>
                ))}
              </ul>
            </div>
            <div className="card lg:col-span-2">
              <h3 className="font-semibold">Recent Reviews (All Sources)</h3>
              <ul className="mt-3 space-y-2">
                {data.customerExperience.recentReviews.map((r, i) => (
                  <li key={i} className="rounded border p-3 text-sm">
                    <span className="font-medium">{r.source}</span> · {r.rating}★
                    {r.category && <span className="text-slate-400"> · {r.category}</span>}
                    {r.comment && <p className="mt-1 text-slate-600">{r.comment}</p>}
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <SectionAnalysisPanel section="customer" questions={data.customerExperience.questions} />
        </div>
      )}

      {tab === "operations" && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Avg Ticket Time" value={`${data.operations.avgTicketTimeMinutes.toFixed(0)} min`} />
            <StatCard label="Kitchen Production" value={`${data.operations.avgKitchenProductionMinutes.toFixed(0)} min`} subtext="Est. from ticket time" />
            <StatCard label="Order Accuracy" value={`${data.operations.orderAccuracyPct.toFixed(1)}%`} />
            <StatCard label="Void Rate" value={`${data.operations.voidRatePct.toFixed(2)}%`} />
            <StatCard label="Discount Rate" value={`${data.operations.discountRatePct.toFixed(2)}%`} />
            <StatCard label="Comp Rate" value={`${data.operations.compRatePct.toFixed(2)}%`} />
            <StatCard label="Refunds / Voids" value={formatCurrency(data.operations.refundTotal)} />
            <StatCard label="Slowest Daypart" value={data.operations.bottleneckDaypart} />
          </div>

          <div className="card border-blue-100 bg-blue-50/50">
            <h3 className="font-semibold text-slate-900">Operations Intelligence</h3>
            <p className="mt-1 text-sm text-slate-500">Answers to key operations questions — use Run Analysis for deeper AI recommendations.</p>
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <div className="rounded-lg border border-blue-100 bg-white p-4">
                <p className="text-xs font-semibold uppercase text-blue-600">Where are bottlenecks?</p>
                <p className="mt-2 text-sm font-medium text-slate-800">
                  {data.operations.highlights.bottlenecks.length > 0
                    ? data.operations.highlights.bottlenecks
                        .slice(0, 3)
                        .map((b) => `${b.label} (${b.avgTicketMinutes.toFixed(0)} min)`)
                        .join(", ")
                    : "No bottleneck pattern yet"}
                </p>
                <p className="mt-1 text-sm text-slate-600">Slowest dayparts and hours by average ticket time.</p>
              </div>
              <div className="rounded-lg border border-blue-100 bg-white p-4">
                <p className="text-xs font-semibold uppercase text-blue-600">Are long ticket times hurting sales?</p>
                <p className="mt-2 text-sm font-medium capitalize text-slate-800">
                  {data.operations.highlights.ticketTimeImpact.status === "hurting"
                    ? "Yes — likely impacting throughput"
                    : data.operations.highlights.ticketTimeImpact.status === "manageable"
                      ? "Manageable for now"
                      : "Insufficient data"}
                </p>
                <p className="mt-1 text-sm text-slate-600">{data.operations.highlights.ticketTimeImpact.reason}</p>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-500">
              <span className="rounded-full bg-white px-2 py-1">Ticket times</span>
              <span className="rounded-full bg-white px-2 py-1">Kitchen production</span>
              <span className="rounded-full bg-white px-2 py-1">Order accuracy</span>
              <span className="rounded-full bg-white px-2 py-1">Voids</span>
              <span className="rounded-full bg-white px-2 py-1">Discounts & comps</span>
              <span className="rounded-full bg-white px-2 py-1">Refunds</span>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="card">
              <h3 className="font-semibold">Ticket Times by Daypart</h3>
              <DataTable
                headers={["Daypart", "Avg Minutes", "Orders"]}
                rows={data.operations.ticketTimesByDaypart.map((d) => [
                  d.daypart,
                  d.avgMinutes > 0 ? `${d.avgMinutes.toFixed(0)} min` : "—",
                  d.orders,
                ])}
              />
            </div>
            <div className="card">
              <h3 className="font-semibold">Ticket Times by Hour</h3>
              <DataTable
                headers={["Hour", "Avg Minutes", "Orders"]}
                rows={data.operations.ticketTimesByHour.map((h) => [
                  h.label,
                  `${h.avgMinutes.toFixed(0)} min`,
                  h.orders,
                ])}
              />
            </div>
            <div className="card">
              <h3 className="font-semibold">Voids, Discounts & Comps</h3>
              <DataTable
                headers={["Type", "Total", "Rate"]}
                rows={[
                  ["Voids", formatCurrency(data.operations.voidTotal), `${data.operations.voidRatePct.toFixed(2)}%`],
                  ["Discounts", formatCurrency(data.operations.discountTotal), `${data.operations.discountRatePct.toFixed(2)}%`],
                  ["Comps", formatCurrency(data.operations.compTotal), `${data.operations.compRatePct.toFixed(2)}%`],
                  ["Refunds", formatCurrency(data.operations.refundTotal), `${data.operations.refundRatePct.toFixed(2)}%`],
                ]}
              />
            </div>
            <div className="card">
              <h3 className="font-semibold">Accuracy & Throughput</h3>
              <DataTable
                headers={["Metric", "Value"]}
                rows={[
                  ["Order accuracy", `${data.operations.orderAccuracyPct.toFixed(1)}%`],
                  ["Avg ticket time", `${data.operations.avgTicketTimeMinutes.toFixed(0)} min`],
                  ["Est. kitchen time", `${data.operations.avgKitchenProductionMinutes.toFixed(0)} min`],
                  ["Slow orders (>25 min)", `${data.operations.highlights.ticketTimeImpact.slowOrderPct.toFixed(0)}%`],
                ]}
              />
            </div>
          </div>
          <SectionAnalysisPanel section="operations" questions={data.operations.questions} />
        </div>
      )}

      {tab === "purchasing" && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard label="Total Purchases" value={formatCurrency(data.purchasing.totalPurchases)} />
            <StatCard label="Vendors" value={data.purchasing.vendorCount} />
            <StatCard label="Cost Inflation" value={`${data.purchasing.costInflationPct.toFixed(1)}%`} />
          </div>
          <div className="card border-blue-100 bg-blue-50/50">
            <h3 className="font-semibold text-slate-900">Purchasing Intelligence</h3>
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <div className="rounded-lg border border-blue-100 bg-white p-4">
                <p className="text-xs font-semibold uppercase text-blue-600">Which suppliers are increasing costs?</p>
                <p className="mt-2 text-sm font-medium text-slate-800">
                  {data.purchasing.highlights.costIncreaseSuppliers.length > 0
                    ? data.purchasing.highlights.costIncreaseSuppliers.slice(0, 3).map((s) => `${s.vendor} (+${s.changePct.toFixed(1)}%)`).join(", ")
                    : "No increases detected"}
                </p>
              </div>
              <div className="rounded-lg border border-blue-100 bg-white p-4">
                <p className="text-xs font-semibold uppercase text-blue-600">Are we paying market rates?</p>
                <p className="mt-2 text-sm font-medium capitalize text-slate-800">{data.purchasing.highlights.marketRateStatus.status}</p>
                <p className="mt-1 text-sm text-slate-600">{data.purchasing.highlights.marketRateStatus.reason}</p>
              </div>
            </div>
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="card">
              <h3 className="font-semibold">Top Vendors</h3>
              <DataTable headers={["Vendor", "Spend", "Orders"]} rows={data.purchasing.topVendors.map((v) => [v.vendor, formatCurrency(v.spend), v.orders])} />
            </div>
            <div className="card">
              <h3 className="font-semibold">Recent Invoices</h3>
              <DataTable headers={["Vendor", "Amount", "Δ%"]} rows={data.purchasing.invoices.map((i) => [i.vendor, formatCurrency(i.amount), `${i.priceChangePct.toFixed(1)}%`])} />
            </div>
          </div>
          <SectionAnalysisPanel section="purchasing" questions={data.purchasing.questions} />
        </div>
      )}

      {tab === "forecasting" && (
        <div className="space-y-6">
          <p className="text-sm text-slate-600">{data.forecasting.seasonalNote}</p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="7d Sales Forecast"
              value={formatCurrency(data.forecasting.salesForecast7d.reduce((s, d) => s + d.predicted, 0))}
            />
            <StatCard
              label="7d Labor Hours"
              value={data.forecasting.laborHoursForecast7d.reduce((s, d) => s + d.hours, 0).toFixed(0)}
            />
            <StatCard
              label="Catering Demand (7d)"
              value={`${data.forecasting.highlights.cateringDemandNext7d.orders} orders`}
              subtext={`${formatCurrency(data.forecasting.highlights.cateringDemandNext7d.sales)} · ${data.forecasting.highlights.cateringDemandNext7d.trend}`}
            />
            <StatCard
              label="Peak Day"
              value={data.forecasting.highlights.seasonalTrend.peakDay || "—"}
              subtext={data.forecasting.highlights.seasonalTrend.liftPct !== 0 ? `${data.forecasting.highlights.seasonalTrend.liftPct > 0 ? "+" : ""}${data.forecasting.highlights.seasonalTrend.liftPct.toFixed(0)}% weekend lift` : undefined}
            />
          </div>
          <div className="card border-blue-100 bg-blue-50/50">
            <h3 className="font-semibold text-slate-900">Forecasting Intelligence</h3>
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <div className="rounded-lg border border-blue-100 bg-white p-4">
                <p className="text-xs font-semibold uppercase text-blue-600">How much staff do I need next Friday?</p>
                <p className="mt-2 text-sm font-medium text-slate-800">
                  {data.forecasting.highlights.staffNeededNextFriday.hours.toFixed(0)} hours · {formatCurrency(data.forecasting.highlights.staffNeededNextFriday.predictedSales)} sales
                </p>
                <p className="mt-1 text-sm text-slate-600">{data.forecasting.highlights.staffNeededNextFriday.date}</p>
              </div>
              <div className="rounded-lg border border-blue-100 bg-white p-4 lg:col-span-2">
                <p className="text-xs font-semibold uppercase text-blue-600">How much of every item should I order tomorrow?</p>
                <p className="mt-1 text-xs text-slate-500">
                  {data.forecasting.highlights.inventoryOrderDate} · {formatCurrency(data.forecasting.salesForecast7d[0]?.predicted ?? 0)} predicted sales
                </p>
                {data.forecasting.highlights.inventoryOrderTomorrow.length > 0 ? (
                  <div className="mt-3 max-h-48 overflow-y-auto">
                    <DataTable
                      headers={["Item", "On Hand", "Order", "Unit"]}
                      rows={data.forecasting.highlights.inventoryOrderTomorrow.map((i) => [
                        i.name,
                        i.onHand.toString(),
                        i.quantity.toString(),
                        i.unit,
                      ])}
                    />
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-slate-600">Add inventory items to generate tomorrow&apos;s order plan.</p>
                )}
              </div>
            </div>
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="card">
              <h3 className="font-semibold">Sales Forecast (7d)</h3>
              <DataTable headers={["Date", "Predicted"]} rows={data.forecasting.salesForecast7d.map((f) => [f.date, formatCurrency(f.predicted)])} />
            </div>
            <div className="card">
              <h3 className="font-semibold">Labor Hours Forecast (7d)</h3>
              <DataTable headers={["Date", "Hours"]} rows={data.forecasting.laborHoursForecast7d.map((f) => [f.date, f.hours.toFixed(0)])} />
            </div>
            <div className="card">
              <h3 className="font-semibold">Catering Demand Forecast (7d)</h3>
              <DataTable
                headers={["Date", "Orders", "Sales"]}
                rows={data.forecasting.cateringDemandForecast7d.map((f) => [
                  f.date,
                  f.predictedOrders.toString(),
                  formatCurrency(f.predictedSales),
                ])}
              />
            </div>
            <div className="card">
              <h3 className="font-semibold">Seasonal Trends</h3>
              <ul className="mt-3 space-y-2 text-sm text-slate-700">
                {data.forecasting.seasonalTrends.map((t) => (
                  <li key={t.label}>
                    <strong>{t.label}:</strong> {t.insight}
                  </li>
                ))}
              </ul>
            </div>
            <div className="card lg:col-span-2">
              <h3 className="font-semibold">Tomorrow&apos;s Order Plan (All Items)</h3>
              <DataTable
                headers={["Item", "On Hand", "Order Qty", "Unit"]}
                rows={data.forecasting.highlights.inventoryOrderTomorrow.map((i) => [
                  i.name,
                  i.onHand,
                  i.quantity,
                  i.unit,
                ])}
              />
            </div>
          </div>
          <SectionAnalysisPanel section="forecasting" questions={data.forecasting.questions} />
        </div>
      )}

      {tab === "profitability" && (
        <div className="space-y-6">
          <p className="text-sm text-slate-600">
            Goes beyond sales, food cost, and labor — profit broken down by item, hour, day, employee, channel, and campaign.
          </p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Gross Profit" value={formatCurrency(data.profitability.grossProfit)} />
            <StatCard label="Net Profit Est." value={formatCurrency(data.profitability.netProfitEstimate)} />
            <StatCard label="Margin %" value={`${data.profitability.profitMarginPct.toFixed(1)}%`} subtext="Most important dashboard" />
            <StatCard
              label="Top Profit Item"
              value={data.profitability.highlights.topProfitItem?.name ?? "—"}
              subtext={data.profitability.highlights.topProfitItem ? formatCurrency(data.profitability.highlights.topProfitItem.profit) : undefined}
            />
          </div>
          <div className="card border-blue-100 bg-blue-50/50">
            <h3 className="font-semibold text-slate-900">Profitability Intelligence</h3>
            <div className="mt-4 grid gap-4 lg:grid-cols-3">
              <div className="rounded-lg border border-blue-100 bg-white p-4">
                <p className="text-xs font-semibold uppercase text-blue-600">Where is profit leaking?</p>
                <p className="mt-2 text-sm font-medium text-slate-800">
                  {data.profitability.highlights.profitLeaks.length > 0
                    ? data.profitability.highlights.profitLeaks.slice(0, 3).map((l) => l.area).join(", ")
                    : "No major leaks"}
                </p>
              </div>
              <div className="rounded-lg border border-blue-100 bg-white p-4">
                <p className="text-xs font-semibold uppercase text-blue-600">Best profit hour & day</p>
                <p className="mt-2 text-sm font-medium text-slate-800">
                  {data.profitability.highlights.topProfitHour
                    ? `${data.profitability.highlights.topProfitHour.label} · ${formatCurrency(data.profitability.highlights.topProfitHour.profit)}`
                    : "—"}
                </p>
                <p className="mt-1 text-sm text-slate-600">
                  {data.profitability.highlights.topProfitDay
                    ? `${data.profitability.highlights.topProfitDay.date} · ${formatCurrency(data.profitability.highlights.topProfitDay.profit)}`
                    : "No day data"}
                </p>
              </div>
              <div className="rounded-lg border border-blue-100 bg-white p-4">
                <p className="text-xs font-semibold uppercase text-blue-600">Top employee, channel & campaign</p>
                <p className="mt-2 text-sm font-medium text-slate-800">
                  {data.profitability.highlights.topProfitEmployee
                    ? `${data.profitability.highlights.topProfitEmployee.name} · ${formatCurrency(data.profitability.highlights.topProfitEmployee.profit)}`
                    : "—"}
                </p>
                <p className="mt-1 text-sm text-slate-600">
                  {data.profitability.highlights.topProfitChannel
                    ? `${data.profitability.highlights.topProfitChannel.channel} · ${formatCurrency(data.profitability.highlights.topProfitChannel.profit)}`
                    : "—"}
                  {data.profitability.highlights.topCampaign
                    ? ` · ${data.profitability.highlights.topCampaign.name}`
                    : ""}
                </p>
              </div>
            </div>
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="card">
              <h3 className="font-semibold">Profit by Menu Item</h3>
              <DataTable headers={["Item", "Profit", "Margin %"]} rows={data.profitability.byMenuItem.map((i) => [i.name, formatCurrency(i.profit), `${i.marginPct.toFixed(0)}%`])} />
            </div>
            <div className="card">
              <h3 className="font-semibold">Profit by Category</h3>
              <DataTable headers={["Category", "Profit", "Margin %"]} rows={data.profitability.byCategory.map((c) => [c.category, formatCurrency(c.profit), `${c.marginPct.toFixed(0)}%`])} />
            </div>
            <div className="card">
              <h3 className="font-semibold">Profit by Hour</h3>
              <DataTable headers={["Hour", "Profit", "Sales"]} rows={data.profitability.byHour.map((h) => [h.label, formatCurrency(h.profit), formatCurrency(h.sales)])} />
            </div>
            <div className="card">
              <h3 className="font-semibold">Profit by Day</h3>
              <DataTable headers={["Date", "Profit", "Sales"]} rows={data.profitability.byDay.map((d) => [d.date, formatCurrency(d.profit), formatCurrency(d.sales)])} />
            </div>
            <div className="card">
              <h3 className="font-semibold">Profit by Employee</h3>
              <DataTable headers={["Employee", "Role", "Profit"]} rows={data.profitability.byEmployee.map((e) => [e.name, e.role, formatCurrency(e.profit)])} />
            </div>
            <div className="card">
              <h3 className="font-semibold">Profit by Shift</h3>
              <DataTable headers={["Shift", "Profit", "Labor"]} rows={data.profitability.byShift.map((s) => [s.shift, formatCurrency(s.profit), formatCurrency(s.laborCost)])} />
            </div>
            <div className="card">
              <h3 className="font-semibold">Profit by Daypart</h3>
              <DataTable headers={["Daypart", "Profit", "Margin %"]} rows={data.profitability.byDaypart.map((d) => [d.daypart, formatCurrency(d.profit), `${d.marginPct.toFixed(0)}%`])} />
            </div>
            <div className="card">
              <h3 className="font-semibold">Profit by Location</h3>
              <DataTable headers={["Location", "Profit", "Margin %"]} rows={data.profitability.byLocation.map((l) => [l.name, formatCurrency(l.profit), `${l.marginPct.toFixed(0)}%`])} />
            </div>
            <div className="card">
              <h3 className="font-semibold">Profit by Channel</h3>
              <DataTable headers={["Channel", "Profit", "Margin %"]} rows={data.profitability.byChannel.map((c) => [c.channel, formatCurrency(c.profit), `${c.marginPct.toFixed(0)}%`])} />
            </div>
            <div className="card">
              <h3 className="font-semibold">Profit by Delivery Provider</h3>
              <DataTable
                headers={["Provider", "Profit", "Orders"]}
                rows={data.profitability.byDeliveryProvider.length > 0
                  ? data.profitability.byDeliveryProvider.map((d) => [d.provider, formatCurrency(d.profit), d.orders])
                  : [["—", "No delivery orders", "—"]]}
              />
            </div>
            <div className="card lg:col-span-2">
              <h3 className="font-semibold">Profit by Marketing Campaign</h3>
              <DataTable
                headers={["Campaign", "Channel", "Profit", "Spend", "ROI %"]}
                rows={data.profitability.byCampaign.map((c) => [
                  c.name,
                  c.channel,
                  formatCurrency(c.profit),
                  formatCurrency(c.spend),
                  `${c.roiPct.toFixed(0)}%`,
                ])}
              />
            </div>
            <div className="card lg:col-span-2">
              <h3 className="font-semibold">Profit Leaks</h3>
              <DataTable headers={["Area", "Amount", "Reason"]} rows={data.profitability.highlights.profitLeaks.map((l) => [l.area, formatCurrency(l.amount), l.reason])} />
            </div>
          </div>
          <SectionAnalysisPanel section="profitability" questions={data.profitability.questions} />
        </div>
      )}

      {tab === "external" && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-slate-600">
              Tracks weather, events, holidays, sports, tourism, and school schedules — learns patterns automatically.
            </p>
            <Button size="sm" variant="secondary" onClick={syncWeather} disabled={weatherSyncing}>
              {weatherSyncing ? "Syncing weather..." : "Sync weather forecast"}
            </Button>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Weather source"
              value={data.externalFactors.weatherSource || "—"}
              subtext={data.externalFactors.weatherGeo ?? "Set location address"}
            />
            <StatCard
              label="Learned patterns"
              value={data.externalFactors.learnedPatterns.length}
              subtext="Auto-detected from history"
            />
            <StatCard
              label="Tourism level"
              value={data.externalFactors.highlights.tourismLevel ?? "—"}
            />
            <StatCard
              label="Factor categories"
              value={data.externalFactors.byCategory.length}
            />
          </div>
          <div className="card border-blue-100 bg-blue-50/50">
            <h3 className="font-semibold text-slate-900">External Factors Intelligence</h3>
            <div className="mt-4 grid gap-4 lg:grid-cols-3">
              <div className="rounded-lg border border-blue-100 bg-white p-4">
                <p className="text-xs font-semibold uppercase text-blue-600">How does weather affect sales and delivery?</p>
                <p className="mt-2 text-sm font-medium text-slate-800">
                  {data.externalFactors.highlights.weatherImpact
                    ? data.externalFactors.highlights.weatherImpact.insight
                    : "Sync weather to learn rain/delivery patterns"}
                </p>
                {data.externalFactors.highlights.weatherImpact?.deliveryShiftPct != null && (
                  <p className="mt-1 text-sm text-slate-600">
                    Delivery shift: {data.externalFactors.highlights.weatherImpact.deliveryShiftPct >= 0 ? "+" : ""}
                    {data.externalFactors.highlights.weatherImpact.deliveryShiftPct.toFixed(0)}%
                  </p>
                )}
              </div>
              <div className="rounded-lg border border-blue-100 bg-white p-4">
                <p className="text-xs font-semibold uppercase text-blue-600">Events, holidays & sports</p>
                <p className="mt-2 text-sm font-medium text-slate-800">
                  {data.externalFactors.highlights.topEvents.length > 0
                    ? data.externalFactors.highlights.topEvents.slice(0, 2).map((e) => `${e.description} (+${e.impactPct.toFixed(0)}%)`).join("; ")
                    : "No events logged"}
                </p>
              </div>
              <div className="rounded-lg border border-blue-100 bg-white p-4">
                <p className="text-xs font-semibold uppercase text-blue-600">Auto-learned patterns</p>
                <p className="mt-2 text-sm font-medium text-slate-800">
                  {data.externalFactors.highlights.learnedPatterns.length > 0
                    ? data.externalFactors.highlights.learnedPatterns[0]!.insight
                    : "More order history improves pattern confidence"}
                </p>
                {data.externalFactors.highlights.schoolScheduleNote && (
                  <p className="mt-1 text-sm text-slate-600">School: {data.externalFactors.highlights.schoolScheduleNote}</p>
                )}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {data.externalFactors.highlights.categoryCoverage.map((c) => (
              <Badge
                key={c.category}
                className={
                  c.learned
                    ? "bg-green-100 text-green-800"
                    : c.tracked
                      ? "bg-blue-100 text-blue-800"
                      : "bg-slate-100 text-slate-500"
                }
              >
                {c.label} {c.learned ? "✓ learned" : c.tracked ? "✓ tracked" : "—"}
              </Badge>
            ))}
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="card">
              <h3 className="font-semibold">7-Day Weather Forecast</h3>
              <DataTable
                headers={["Date", "Condition", "Precip %", "High/Low"]}
                rows={data.externalFactors.weatherForecast.map((f) => [
                  f.date,
                  f.condition,
                  `${f.precipitationPct}%`,
                  `${f.tempHigh}° / ${f.tempLow}°`,
                ])}
              />
            </div>
            <div className="card">
              <h3 className="font-semibold">Learned Patterns (Automatic)</h3>
              <ul className="mt-2 space-y-2 text-sm text-slate-600">
                {data.externalFactors.learnedPatterns.length > 0 ? (
                  data.externalFactors.learnedPatterns.map((p) => (
                    <li key={`${p.pattern}-${p.metric}`}>
                      <strong>{p.pattern}</strong> ({p.confidence} confidence): {p.insight}
                    </li>
                  ))
                ) : (
                  <li>Log factors and accumulate orders — patterns emerge automatically.</li>
                )}
              </ul>
            </div>
            <div className="card">
              <h3 className="font-semibold">By Category</h3>
              <DataTable
                headers={["Category", "Count", "Avg Impact"]}
                rows={data.externalFactors.byCategory.map((c) => [c.category, c.count, `${c.avgImpactPct.toFixed(0)}%`])}
              />
            </div>
            <div className="card">
              <h3 className="font-semibold">Recorded Factors</h3>
              <DataTable
                headers={["Date", "Category", "Impact", "Description"]}
                rows={data.externalFactors.factors.map((f) => [
                  f.date.split("T")[0],
                  f.category,
                  `${f.impactPct}%`,
                  f.description.length > 48 ? `${f.description.slice(0, 48)}…` : f.description,
                ])}
              />
            </div>
          </div>
          <SectionAnalysisPanel section="external" questions={data.externalFactors.questions} />
        </div>
      )}

      <div className="mt-8 card">
        <h2 className="font-semibold">Coverage Checklist</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {data.coverage.sections.map((s) => (
            <Badge
              key={s.id}
              className={s.covered ? "bg-green-100 text-green-800" : "bg-slate-100 text-slate-500"}
            >
              {s.label} {s.covered ? "✓" : "—"}
            </Badge>
          ))}
        </div>
      </div>
    </div>
  );
}
