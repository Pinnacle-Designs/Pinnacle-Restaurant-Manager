"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { PageHeader, StatCard, Badge, Button, ScrollableTabs, TabPill } from "@/components/ui";
import { formatCurrency } from "@/lib/utils";
import { cn } from "@/lib/utils";
import type { AnalyticsPayload } from "@/lib/analytics/types";
import { normalizeAnalyticsPayload } from "@/lib/analytics/normalize";
import { SectionAnalysisPanel } from "@/components/analytics/SectionAnalysisPanel";
import { AnalyticsTabShell, AnalyticsBlock } from "@/components/analytics/AnalyticsCollapsible";
import {
  AnalyticsViewModeProvider,
  DataView,
  ViewModeToggle,
  ANALYTICS_VIEW_OPTIONS,
  type DataViewMode,
} from "@/components/charts";
import {
  analyticsTabsForPlan,
  canAccessAnalyticsTab,
  PLAN_BY_ID,
  requiredPlanForAnalyticsTab,
  type PlanId,
} from "@/lib/plans";

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

export function AnalyticsClient({ plan }: { plan: PlanId }) {
  const allowedTabs = useMemo(() => analyticsTabsForPlan(plan), [plan]);
  const [data, setData] = useState<AnalyticsPayload | null>(null);
  const [tab, setTab] = useState<TabId>(() => allowedTabs[0] ?? "executive");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [seeding, setSeeding] = useState(false);
  const [weatherSyncing, setWeatherSyncing] = useState(false);
  const [viewMode, setViewMode] = useState<DataViewMode>("table");

  useEffect(() => {
    if (!canAccessAnalyticsTab(plan, tab)) {
      setTab(allowedTabs[0] ?? "executive");
    }
  }, [plan, tab, allowedTabs]);

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
    <AnalyticsViewModeProvider mode={viewMode}>
    <div>
      <PageHeader
        title="Analytics"
        description={`Restaurant intelligence — last ${data.periodDays} days`}
        reportId="sales-by-item"
      >
        <ViewModeToggle
          value={viewMode}
          onChange={setViewMode}
          options={ANALYTICS_VIEW_OPTIONS}
        />
      </PageHeader>

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

      <ScrollableTabs className="mb-4 gap-1 rounded-lg border bg-white p-1" menuLabel="Analytics">
        {TABS.map(({ id, label }) => {
          const locked = !canAccessAnalyticsTab(plan, id);
          return (
            <TabPill
              key={id}
              id={id}
              active={tab === id}
              onClick={() => !locked && setTab(id)}
              className={cn(
                "px-2 text-xs sm:px-3 sm:text-sm",
                tab === id && "bg-orange-500 text-white hover:bg-orange-500",
                locked && "cursor-not-allowed opacity-45"
              )}
            >
              {label}
              {locked ? " 🔒" : ""}
            </TabPill>
          );
        })}
      </ScrollableTabs>

      {!canAccessAnalyticsTab(plan, tab) && (
        <div className="mb-4 rounded-xl border border-orange-200 bg-orange-50 p-4">
          <p className="text-sm font-medium text-orange-900">
            {PLAN_BY_ID[requiredPlanForAnalyticsTab(tab)].name} plan required
          </p>
          <p className="mt-1 text-sm text-orange-800">
            Your {PLAN_BY_ID[plan].name} plan includes {allowedTabs.length} analytics modules.
            Upgrade to unlock {TABS.find((t) => t.id === tab)?.label}.
          </p>
          <Link
            href="/account?tab=billing"
            className="mt-3 inline-flex text-sm font-medium text-orange-600 hover:text-orange-500"
          >
            Upgrade plan →
          </Link>
        </div>
      )}

      {canAccessAnalyticsTab(plan, tab) && tab === "executive" && (
        <AnalyticsTabShell tabId="executive">
          <AnalyticsBlock id="exec-yesterday" title="Yesterday" defaultOpen>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <StatCard label="Sales" value={formatCurrency(e.yesterday.sales)} />
              <StatCard label="Net Sales" value={formatCurrency(e.yesterday.netSales)} />
              <StatCard label="Food Cost %" value={`${e.yesterday.foodCostPct.toFixed(1)}%`} />
              <StatCard label="Labor %" value={`${e.yesterday.laborPct.toFixed(1)}%`} />
              <StatCard label="Prime Cost %" value={`${e.yesterday.primeCostPct.toFixed(1)}%`} />
              <StatCard label="Profit Est." value={formatCurrency(e.yesterday.profitEstimate)} />
              <StatCard label="Guests" value={e.yesterday.guestCount} />
            </div>
          </AnalyticsBlock>

          <AnalyticsBlock id="exec-trends" title="Last 7 days trends">
            <DataView
              headers={["Date", "Sales", "Profit Est.", "Avg Rating"]}
              rows={e.last7Days.salesTrend.map((s, i) => [
                s.date,
                formatCurrency(s.sales),
                formatCurrency(e.last7Days.profitTrend[i]?.profit ?? 0),
                e.last7Days.reviewTrend[i]?.avgRating.toFixed(1) ?? "—",
              ])}
            />
          </AnalyticsBlock>

          {e.alerts.length > 0 && (
            <AnalyticsBlock
              id="exec-alerts"
              title="Alerts"
              className="border-amber-200 bg-amber-50"
              defaultOpen
            >
              <ul className="space-y-2">
                {e.alerts.map((a) => (
                  <li key={a.message} className="text-sm text-amber-800">• {a.message}</li>
                ))}
              </ul>
            </AnalyticsBlock>
          )}

          <AnalyticsBlock id="exec-ai" title="AI analysis">
            <SectionAnalysisPanel
              section="executive"
              questions={EXECUTIVE_QUESTIONS}
              initialInsights={data.aiInsights}
            />
          </AnalyticsBlock>
        </AnalyticsTabShell>
      )}

      {canAccessAnalyticsTab(plan, tab) && tab === "sales" && (
        <AnalyticsTabShell tabId="sales">
          <AnalyticsBlock id="sales-metrics" title="Key metrics" defaultOpen>
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
          </AnalyticsBlock>

          <AnalyticsBlock id="sales-intel" title="Sales intelligence" className="border-orange-100 bg-orange-50/50">
            <div className="grid gap-4 sm:grid-cols-3">
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
          </AnalyticsBlock>

          <AnalyticsBlock id="sales-daypart" title="By daypart">
            <DataView
              headers={["Daypart", "Net Sales", "Orders"]}
              rows={data.sales.byDaypart.map((d) => [d.daypart, formatCurrency(d.sales), d.orders])}
            />
          </AnalyticsBlock>
          <AnalyticsBlock id="sales-channel" title="By channel">
            <DataView
              headers={["Channel", "Net Sales", "Profit", "Margin", "Orders"]}
              rows={data.sales.byChannel.map((c) => [
                c.channel,
                formatCurrency(c.sales),
                formatCurrency(c.profit),
                `${c.marginPct.toFixed(1)}%`,
                c.orders,
              ])}
            />
          </AnalyticsBlock>
          <AnalyticsBlock id="sales-hourly" title="Sales by hour" description="Peak hours drive staffing and prep.">
            <DataView
              headers={["Hour", "Orders", "Sales"]}
              rows={data.sales.byHour.map((h) => [
                formatHourLabel(h.hour),
                h.orders,
                formatCurrency(h.sales),
              ])}
              chartPoints={data.sales.byHour.map((h) => ({
                label: formatHourLabel(h.hour),
                value: h.orders,
              }))}
              chartKind="bar"
              valueLabel="Orders"
              formatValue={(v) => `${v} orders`}
            />
          </AnalyticsBlock>
          <AnalyticsBlock id="sales-items" title="Top menu items">
            <DataView
              headers={["Item", "Sales", "Qty"]}
              rows={data.sales.byMenuItem.map((i) => [i.name, formatCurrency(i.sales), i.quantity])}
            />
          </AnalyticsBlock>
          <AnalyticsBlock id="sales-category" title="By category">
            <DataView
              headers={["Category", "Sales", "Qty"]}
              rows={data.sales.byCategory.map((c) => [c.category, formatCurrency(c.sales), c.quantity])}
            />
          </AnalyticsBlock>
          <AnalyticsBlock id="sales-ai" title="AI analysis">
            <SectionAnalysisPanel section="sales" questions={data.sales.questions} />
          </AnalyticsBlock>
        </AnalyticsTabShell>
      )}

      {canAccessAnalyticsTab(plan, tab) && tab === "food" && (
        <AnalyticsTabShell tabId="food">
          <AnalyticsBlock id="food-metrics" title="Key metrics" defaultOpen>
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
          </AnalyticsBlock>

          <AnalyticsBlock id="food-intel" title="Food Cost Intelligence" className="border-blue-100 bg-blue-50/50">
            <p className="text-sm text-slate-500">Answers to the key food cost questions — use Run Analysis for deeper AI recommendations.</p>
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
          </AnalyticsBlock>

          <AnalyticsBlock id="food-inventory-counts" title="Inventory Counts">
            <DataView
              headers={["Item", "Qty", "Value", "Yield %"]}
              rows={data.foodCost.inventoryCounts.map((i) => [
                i.name,
                `${i.quantity} ${i.unit}`,
                formatCurrency(i.valuation),
                `${i.yieldPct.toFixed(0)}%`,
              ])}
            />
          </AnalyticsBlock>
          <AnalyticsBlock id="food-portion-yield" title="Portion & Yield Costs">
            <DataView
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
          </AnalyticsBlock>
          <AnalyticsBlock id="food-recipe-costs" title="Recipe Costs">
            <DataView
              headers={["Menu Item", "Price", "Recipe Cost", "FC %"]}
              rows={data.foodCost.recipeCosts.map((r) => [
                r.name,
                formatCurrency(r.price),
                formatCurrency(r.recipeCost),
                `${r.recipeCostPct.toFixed(1)}%`,
              ])}
            />
          </AnalyticsBlock>
          <AnalyticsBlock id="food-waste-spoilage" title="Waste & Spoilage">
            <DataView
              headers={["Reason", "Cost", "Qty"]}
              rows={data.foodCost.wasteByReason.map((w) => [
                w.reason,
                formatCurrency(w.cost),
                w.quantity.toFixed(1),
              ])}
            />
          </AnalyticsBlock>
          <AnalyticsBlock id="food-vendor-price-changes" title="Vendor Price Changes">
            <DataView
              headers={["Vendor", "Category", "Latest Δ%"]}
              rows={data.foodCost.pricingChanges.map((p) => [
                p.vendor,
                p.category,
                `${p.latestChangePct >= 0 ? "+" : ""}${p.latestChangePct.toFixed(1)}%`,
              ])}
            />
          </AnalyticsBlock>
          <AnalyticsBlock id="food-vendor-comparison" title="Vendor Comparison">
            <DataView
              headers={["Item", "Current", "Cheapest", "Savings"]}
              rows={data.foodCost.vendorComparison.map((v) => [
                v.itemName,
                v.currentVendor ?? "—",
                `${v.cheapestVendor} (${formatCurrency(v.cheapestPrice)})`,
                `${v.potentialSavingsPct.toFixed(1)}%`,
              ])}
            />
          </AnalyticsBlock>
          <AnalyticsBlock id="food-pricing-over-time" title="Pricing Over Time">
            <DataView
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
          </AnalyticsBlock>
          <AnalyticsBlock id="food-top-cost-drivers" title="Top Cost Drivers">
            <DataView
              headers={["Item", "Value", "Price Δ%"]}
              rows={data.foodCost.topCostDrivers.map((i) => [i.name, formatCurrency(i.cost), `${i.changePct.toFixed(1)}%`])}
            />
          </AnalyticsBlock>
          <AnalyticsBlock id="food-low-stock" title="Low Stock">
            <DataView
              headers={["Item", "Qty", "Min"]}
              rows={data.foodCost.lowStockItems.map((i) => [i.name, i.quantity, i.minQuantity])}
            />
          </AnalyticsBlock>
          <AnalyticsBlock id="food-ai" title="AI analysis">
            <SectionAnalysisPanel section="food" questions={data.foodCost.questions} />
          </AnalyticsBlock>
        </AnalyticsTabShell>
      )}

      {canAccessAnalyticsTab(plan, tab) && tab === "labor" && (
        <AnalyticsTabShell tabId="labor">
          <AnalyticsBlock id="labor-metrics" title="Key metrics" defaultOpen>
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
          </AnalyticsBlock>

          <AnalyticsBlock id="labor-intel" title="Labor Intelligence" className="border-blue-100 bg-blue-50/50">
            <p className="text-sm text-slate-500">Answers to key labor questions — use Run Analysis for deeper AI recommendations.</p>
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
          </AnalyticsBlock>

          <AnalyticsBlock id="labor-by-position" title="Labor Cost by Position">
            <DataView
              headers={["Role", "Hours", "Cost"]}
              rows={data.labor.byPosition.map((p) => [p.role, p.hours.toFixed(1), formatCurrency(p.cost)])}
            />
          </AnalyticsBlock>
          <AnalyticsBlock id="labor-by-shift" title="Labor Cost by Shift">
            <DataView
              headers={["Shift", "Hours", "Labor Cost", "Sales", "Sales/Labor Hr"]}
              rows={data.labor.byShift.map((s) => [
                s.label,
                s.hours.toFixed(0),
                formatCurrency(s.laborCost),
                formatCurrency(s.sales),
                formatCurrency(s.salesPerLaborHour),
              ])}
            />
          </AnalyticsBlock>
          <AnalyticsBlock
            id="labor-by-sales-hour"
            title="Labor Cost by Sales Hour"
            description="Staffing vs revenue by hour — spot over- and under-staffed periods."
          >
            <DataView
              headers={["Hour", "Labor Hrs", "Labor Cost", "Sales", "Sales/Labor Hr"]}
              rows={data.labor.bySalesHour.map((h) => [
                h.label,
                h.laborHours.toFixed(1),
                formatCurrency(h.laborCost),
                formatCurrency(h.sales),
                formatCurrency(h.salesPerLaborHour),
              ])}
            />
          </AnalyticsBlock>
          <AnalyticsBlock id="labor-employee-productivity" title="Employee Productivity">
            <DataView
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
          </AnalyticsBlock>
          <AnalyticsBlock id="labor-ai" title="AI analysis">
            <SectionAnalysisPanel section="labor" questions={data.labor.questions} />
          </AnalyticsBlock>
        </AnalyticsTabShell>
      )}

      {canAccessAnalyticsTab(plan, tab) && tab === "menu" && (
        <AnalyticsTabShell tabId="menu">
          <AnalyticsBlock id="menu-metrics" title="Key metrics" defaultOpen>
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
          </AnalyticsBlock>

          <AnalyticsBlock id="menu-intel" title="Menu Engineering Intelligence" className="border-blue-100 bg-blue-50/50">
            <p className="text-sm text-slate-500">Answers to key menu questions — use Run Analysis for deeper AI recommendations.</p>
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
          </AnalyticsBlock>

          <AnalyticsBlock id="menu-mix" title="Menu Mix by Category">
            <DataView
              headers={["Category", "Sales", "Mix %", "Qty", "Contribution"]}
              rows={data.menuEngineering.menuMix.map((c) => [
                c.category,
                formatCurrency(c.sales),
                `${c.mixPct.toFixed(1)}%`,
                c.quantity,
                formatCurrency(c.contribution),
              ])}
            />
          </AnalyticsBlock>
          <AnalyticsBlock id="menu-quadrant" title="Quadrant Breakdown">
            <DataView
              headers={["Quadrant", "Count", "Top Item"]}
              rows={[
                ["Stars", data.menuEngineering.byQuadrant.star.length, data.menuEngineering.byQuadrant.star[0]?.name ?? "—"],
                ["Plowhorses", data.menuEngineering.byQuadrant.plowhorse.length, data.menuEngineering.byQuadrant.plowhorse[0]?.name ?? "—"],
                ["Puzzles", data.menuEngineering.byQuadrant.puzzle.length, data.menuEngineering.byQuadrant.puzzle[0]?.name ?? "—"],
                ["Dogs", data.menuEngineering.byQuadrant.dog.length, data.menuEngineering.byQuadrant.dog[0]?.name ?? "—"],
              ]}
            />
          </AnalyticsBlock>
          <AnalyticsBlock
            id="menu-matrix"
            title="Menu Engineering Matrix"
            description={`Items classified vs avg popularity (${data.menuEngineering.avgPopularityPct.toFixed(1)}%) and avg margin (${data.menuEngineering.avgMarginPct.toFixed(1)}%).`}
          >
            <DataView
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
          </AnalyticsBlock>
          <AnalyticsBlock id="menu-ai" title="AI analysis">
            <SectionAnalysisPanel section="menu" questions={data.menuEngineering.questions} />
          </AnalyticsBlock>
        </AnalyticsTabShell>
      )}

      {canAccessAnalyticsTab(plan, tab) && tab === "marketing" && (
        <AnalyticsTabShell tabId="marketing">
          <AnalyticsBlock id="marketing-metrics" title="Key metrics" defaultOpen>
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
          </AnalyticsBlock>

          <AnalyticsBlock id="marketing-intel" title="Marketing Intelligence" className="border-blue-100 bg-blue-50/50">
            <p className="text-sm text-slate-500">Answers to key marketing questions — use Run Analysis for deeper AI recommendations.</p>
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
          </AnalyticsBlock>

          <AnalyticsBlock id="marketing-campaigns" title="Campaign Performance">
            <DataView
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
          </AnalyticsBlock>
          <AnalyticsBlock id="marketing-channel-profit" title="Channel Profitability">
            <DataView
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
          </AnalyticsBlock>
          <AnalyticsBlock id="marketing-coupons" title="Coupon Usage">
            <DataView
              headers={["Metric", "Value"]}
              rows={[
                ["Orders with discount", data.marketing.couponUsage.ordersWithCoupon],
                ["Coupon rate", `${data.marketing.couponUsage.couponRatePct.toFixed(1)}%`],
                ["Total discounts", formatCurrency(data.marketing.couponUsage.totalDiscount)],
                ["Avg discount", formatCurrency(data.marketing.couponUsage.avgDiscount)],
              ]}
            />
          </AnalyticsBlock>
          <AnalyticsBlock id="marketing-email" title="Email Performance">
            <DataView
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
          </AnalyticsBlock>
          <AnalyticsBlock id="marketing-social" title="Social Media">
            <DataView
              headers={["Platform", "Followers", "Posts"]}
              rows={data.marketing.socialMedia.accounts.map((a) => [
                a.platform,
                a.followers,
                a.postsPublished,
              ])}
            />
          </AnalyticsBlock>
          <AnalyticsBlock id="marketing-google-business" title="Google Business">
            <DataView
              headers={["Metric", "Value"]}
              rows={[
                ["Reviews", data.marketing.googleBusiness.reviewCount],
                ["Avg rating", data.marketing.googleBusiness.avgRating.toFixed(1)],
                ["Profile views (30d)", data.marketing.googleBusiness.profileViews30d],
                ["Direction requests", data.marketing.googleBusiness.directionRequests],
              ]}
            />
          </AnalyticsBlock>
          {data.marketing.websiteTraffic && (
            <AnalyticsBlock
              id="marketing-website-traffic"
              title="Website Traffic"
              description={data.marketing.websiteTraffic.url}
            >
              <DataView
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
            </AnalyticsBlock>
          )}
          <AnalyticsBlock id="marketing-ai" title="AI analysis">
            <SectionAnalysisPanel section="marketing" questions={data.marketing.questions} />
          </AnalyticsBlock>
        </AnalyticsTabShell>
      )}

      {canAccessAnalyticsTab(plan, tab) && tab === "customer" && (
        <AnalyticsTabShell tabId="customer">
          <AnalyticsBlock id="customer-metrics" title="Key metrics" defaultOpen>
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
          </AnalyticsBlock>

          <AnalyticsBlock id="customer-intel" title="Guest Experience Intelligence" className="border-blue-100 bg-blue-50/50">
            <p className="text-sm text-slate-500">Answers to key guest experience questions — use Run Analysis for deeper AI recommendations.</p>
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
          </AnalyticsBlock>

          <AnalyticsBlock id="customer-star-distribution" title="Star Rating Distribution">
            <DataView
              headers={["Stars", "Count", "Share"]}
              rows={data.customerExperience.starDistribution.map((s) => [
                `${s.stars}★`,
                s.count,
                `${s.pct.toFixed(0)}%`,
              ])}
            />
          </AnalyticsBlock>
          <AnalyticsBlock id="customer-surveys" title="Survey Results by Category">
            <DataView
              headers={["Category", "Responses", "Avg Score", "Satisfied %"]}
              rows={data.customerExperience.surveyResults.map((s) => [
                s.category,
                s.responses,
                s.avgScore.toFixed(1),
                `${s.satisfiedPct.toFixed(0)}%`,
              ])}
            />
          </AnalyticsBlock>
          <AnalyticsBlock id="customer-complaint-categories" title="Complaint Categories">
            <DataView
              headers={["Category", "Count"]}
              rows={data.customerExperience.complaintCategories.map((c) => [c.category, c.count])}
            />
          </AnalyticsBlock>
          <AnalyticsBlock id="customer-complaints-by-shift" title="Complaints by Shift / Daypart">
            <DataView
              headers={["Daypart", "Negative Reviews", "Avg Rating", "Top Issue"]}
              rows={data.customerExperience.complaintsByDaypart.map((d) => [
                d.daypart,
                d.negativeCount,
                d.avgRating > 0 ? `${d.avgRating.toFixed(1)}★` : "—",
                d.topCategory ?? "—",
              ])}
            />
          </AnalyticsBlock>
          <AnalyticsBlock id="customer-google-reviews" title="Google Reviews">
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
          </AnalyticsBlock>
          <AnalyticsBlock id="customer-opentable-reviews" title="OpenTable Reviews">
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
          </AnalyticsBlock>
          <AnalyticsBlock id="customer-recent-reviews" title="Recent Reviews (All Sources)">
            <ul className="space-y-2">
              {data.customerExperience.recentReviews.map((r, i) => (
                <li key={i} className="rounded border p-3 text-sm">
                  <span className="font-medium">{r.source}</span> · {r.rating}★
                  {r.category && <span className="text-slate-400"> · {r.category}</span>}
                  {r.comment && <p className="mt-1 text-slate-600">{r.comment}</p>}
                </li>
              ))}
            </ul>
          </AnalyticsBlock>
          <AnalyticsBlock id="customer-ai" title="AI analysis">
            <SectionAnalysisPanel section="customer" questions={data.customerExperience.questions} />
          </AnalyticsBlock>
        </AnalyticsTabShell>
      )}

      {canAccessAnalyticsTab(plan, tab) && tab === "operations" && (
        <AnalyticsTabShell tabId="operations">
          <AnalyticsBlock id="operations-metrics" title="Key metrics" defaultOpen>
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
          </AnalyticsBlock>

          <AnalyticsBlock id="operations-intel" title="Operations Intelligence" className="border-blue-100 bg-blue-50/50">
            <p className="text-sm text-slate-500">Answers to key operations questions — use Run Analysis for deeper AI recommendations.</p>
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
          </AnalyticsBlock>

          <AnalyticsBlock id="operations-ticket-daypart" title="Ticket Times by Daypart">
            <DataView
              headers={["Daypart", "Avg Minutes", "Orders"]}
              rows={data.operations.ticketTimesByDaypart.map((d) => [
                d.daypart,
                d.avgMinutes > 0 ? `${d.avgMinutes.toFixed(0)} min` : "—",
                d.orders,
              ])}
            />
          </AnalyticsBlock>
          <AnalyticsBlock id="operations-ticket-hour" title="Ticket Times by Hour">
            <DataView
              headers={["Hour", "Avg Minutes", "Orders"]}
              rows={data.operations.ticketTimesByHour.map((h) => [
                h.label,
                `${h.avgMinutes.toFixed(0)} min`,
                h.orders,
              ])}
            />
          </AnalyticsBlock>
          <AnalyticsBlock id="operations-voids-discounts" title="Voids, Discounts & Comps">
            <DataView
              headers={["Type", "Total", "Rate"]}
              rows={[
                ["Voids", formatCurrency(data.operations.voidTotal), `${data.operations.voidRatePct.toFixed(2)}%`],
                ["Discounts", formatCurrency(data.operations.discountTotal), `${data.operations.discountRatePct.toFixed(2)}%`],
                ["Comps", formatCurrency(data.operations.compTotal), `${data.operations.compRatePct.toFixed(2)}%`],
                ["Refunds", formatCurrency(data.operations.refundTotal), `${data.operations.refundRatePct.toFixed(2)}%`],
              ]}
            />
          </AnalyticsBlock>
          <AnalyticsBlock id="operations-accuracy" title="Accuracy & Throughput">
            <DataView
              headers={["Metric", "Value"]}
              rows={[
                ["Order accuracy", `${data.operations.orderAccuracyPct.toFixed(1)}%`],
                ["Avg ticket time", `${data.operations.avgTicketTimeMinutes.toFixed(0)} min`],
                ["Est. kitchen time", `${data.operations.avgKitchenProductionMinutes.toFixed(0)} min`],
                ["Slow orders (>25 min)", `${data.operations.highlights.ticketTimeImpact.slowOrderPct.toFixed(0)}%`],
              ]}
            />
          </AnalyticsBlock>
          <AnalyticsBlock id="operations-ai" title="AI analysis">
            <SectionAnalysisPanel section="operations" questions={data.operations.questions} />
          </AnalyticsBlock>
        </AnalyticsTabShell>
      )}

      {canAccessAnalyticsTab(plan, tab) && tab === "purchasing" && (
        <AnalyticsTabShell tabId="purchasing">
          <AnalyticsBlock id="purchasing-metrics" title="Key metrics" defaultOpen>
            <div className="grid gap-4 sm:grid-cols-3">
              <StatCard label="Total Purchases" value={formatCurrency(data.purchasing.totalPurchases)} />
              <StatCard label="Vendors" value={data.purchasing.vendorCount} />
              <StatCard label="Cost Inflation" value={`${data.purchasing.costInflationPct.toFixed(1)}%`} />
            </div>
          </AnalyticsBlock>
          <AnalyticsBlock id="purchasing-intel" title="Purchasing Intelligence" className="border-blue-100 bg-blue-50/50">
            <div className="grid gap-4 lg:grid-cols-2">
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
          </AnalyticsBlock>
          <AnalyticsBlock id="purchasing-top-vendors" title="Top Vendors">
            <DataView headers={["Vendor", "Spend", "Orders"]} rows={data.purchasing.topVendors.map((v) => [v.vendor, formatCurrency(v.spend), v.orders])} />
          </AnalyticsBlock>
          <AnalyticsBlock id="purchasing-invoices" title="Recent Invoices">
            <DataView headers={["Vendor", "Amount", "Δ%"]} rows={data.purchasing.invoices.map((i) => [i.vendor, formatCurrency(i.amount), `${i.priceChangePct.toFixed(1)}%`])} />
          </AnalyticsBlock>
          <AnalyticsBlock id="purchasing-ai" title="AI analysis">
            <SectionAnalysisPanel section="purchasing" questions={data.purchasing.questions} />
          </AnalyticsBlock>
        </AnalyticsTabShell>
      )}

      {canAccessAnalyticsTab(plan, tab) && tab === "forecasting" && (
        <AnalyticsTabShell tabId="forecasting">
          <AnalyticsBlock id="forecasting-seasonal-note" title="Seasonal context" defaultOpen>
            <p className="text-sm text-slate-600">{data.forecasting.seasonalNote}</p>
          </AnalyticsBlock>
          <AnalyticsBlock id="forecasting-metrics" title="Key metrics" defaultOpen>
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
          </AnalyticsBlock>
          <AnalyticsBlock id="forecasting-intel" title="Forecasting Intelligence" className="border-blue-100 bg-blue-50/50">
            <div className="grid gap-4 lg:grid-cols-2">
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
                    <DataView
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
          </AnalyticsBlock>
          <AnalyticsBlock id="forecasting-sales-7d" title="Sales Forecast (7d)">
            <DataView headers={["Date", "Predicted"]} rows={data.forecasting.salesForecast7d.map((f) => [f.date, formatCurrency(f.predicted)])} />
          </AnalyticsBlock>
          <AnalyticsBlock id="forecasting-labor-7d" title="Labor Hours Forecast (7d)">
            <DataView headers={["Date", "Hours"]} rows={data.forecasting.laborHoursForecast7d.map((f) => [f.date, f.hours.toFixed(0)])} />
          </AnalyticsBlock>
          <AnalyticsBlock id="forecasting-catering-7d" title="Catering Demand Forecast (7d)">
            <DataView
              headers={["Date", "Orders", "Sales"]}
              rows={data.forecasting.cateringDemandForecast7d.map((f) => [
                f.date,
                f.predictedOrders.toString(),
                formatCurrency(f.predictedSales),
              ])}
            />
          </AnalyticsBlock>
          <AnalyticsBlock id="forecasting-seasonal-trends" title="Seasonal Trends">
            <ul className="space-y-2 text-sm text-slate-700">
              {data.forecasting.seasonalTrends.map((t) => (
                <li key={t.label}>
                  <strong>{t.label}:</strong> {t.insight}
                </li>
              ))}
            </ul>
          </AnalyticsBlock>
          <AnalyticsBlock id="forecasting-order-plan" title="Tomorrow's Order Plan (All Items)">
            <DataView
              headers={["Item", "On Hand", "Order Qty", "Unit"]}
              rows={data.forecasting.highlights.inventoryOrderTomorrow.map((i) => [
                i.name,
                i.onHand,
                i.quantity,
                i.unit,
              ])}
            />
          </AnalyticsBlock>
          <AnalyticsBlock id="forecasting-ai" title="AI analysis">
            <SectionAnalysisPanel section="forecasting" questions={data.forecasting.questions} />
          </AnalyticsBlock>
        </AnalyticsTabShell>
      )}

      {canAccessAnalyticsTab(plan, tab) && tab === "profitability" && (
        <AnalyticsTabShell tabId="profitability">
          <AnalyticsBlock
            id="profitability-metrics"
            title="Key metrics"
            defaultOpen
            description="Goes beyond sales, food cost, and labor — profit broken down by item, hour, day, employee, channel, and campaign."
          >
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
          </AnalyticsBlock>
          <AnalyticsBlock id="profitability-intel" title="Profitability Intelligence" className="border-blue-100 bg-blue-50/50">
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
          </AnalyticsBlock>
          <AnalyticsBlock id="profitability-by-menu-item" title="Profit by Menu Item">
            <DataView headers={["Item", "Profit", "Margin %"]} rows={data.profitability.byMenuItem.map((i) => [i.name, formatCurrency(i.profit), `${i.marginPct.toFixed(0)}%`])} />
          </AnalyticsBlock>
          <AnalyticsBlock id="profitability-by-category" title="Profit by Category">
            <DataView headers={["Category", "Profit", "Margin %"]} rows={data.profitability.byCategory.map((c) => [c.category, formatCurrency(c.profit), `${c.marginPct.toFixed(0)}%`])} />
          </AnalyticsBlock>
          <AnalyticsBlock id="profitability-by-hour" title="Profit by Hour">
            <DataView headers={["Hour", "Profit", "Sales"]} rows={data.profitability.byHour.map((h) => [h.label, formatCurrency(h.profit), formatCurrency(h.sales)])} />
          </AnalyticsBlock>
          <AnalyticsBlock id="profitability-by-day" title="Profit by Day">
            <DataView headers={["Date", "Profit", "Sales"]} rows={data.profitability.byDay.map((d) => [d.date, formatCurrency(d.profit), formatCurrency(d.sales)])} />
          </AnalyticsBlock>
          <AnalyticsBlock id="profitability-by-employee" title="Profit by Employee">
            <DataView headers={["Employee", "Role", "Profit"]} rows={data.profitability.byEmployee.map((e) => [e.name, e.role, formatCurrency(e.profit)])} />
          </AnalyticsBlock>
          <AnalyticsBlock id="profitability-by-shift" title="Profit by Shift">
            <DataView headers={["Shift", "Profit", "Labor"]} rows={data.profitability.byShift.map((s) => [s.shift, formatCurrency(s.profit), formatCurrency(s.laborCost)])} />
          </AnalyticsBlock>
          <AnalyticsBlock id="profitability-by-daypart" title="Profit by Daypart">
            <DataView headers={["Daypart", "Profit", "Margin %"]} rows={data.profitability.byDaypart.map((d) => [d.daypart, formatCurrency(d.profit), `${d.marginPct.toFixed(0)}%`])} />
          </AnalyticsBlock>
          <AnalyticsBlock id="profitability-by-location" title="Profit by Location">
            <DataView headers={["Location", "Profit", "Margin %"]} rows={data.profitability.byLocation.map((l) => [l.name, formatCurrency(l.profit), `${l.marginPct.toFixed(0)}%`])} />
          </AnalyticsBlock>
          <AnalyticsBlock id="profitability-by-channel" title="Profit by Channel">
            <DataView headers={["Channel", "Profit", "Margin %"]} rows={data.profitability.byChannel.map((c) => [c.channel, formatCurrency(c.profit), `${c.marginPct.toFixed(0)}%`])} />
          </AnalyticsBlock>
          <AnalyticsBlock id="profitability-by-delivery" title="Profit by Delivery Provider">
            <DataView
              headers={["Provider", "Profit", "Orders"]}
              rows={data.profitability.byDeliveryProvider.length > 0
                ? data.profitability.byDeliveryProvider.map((d) => [d.provider, formatCurrency(d.profit), d.orders])
                : [["—", "No delivery orders", "—"]]}
            />
          </AnalyticsBlock>
          <AnalyticsBlock id="profitability-by-campaign" title="Profit by Marketing Campaign">
            <DataView
              headers={["Campaign", "Channel", "Profit", "Spend", "ROI %"]}
              rows={data.profitability.byCampaign.map((c) => [
                c.name,
                c.channel,
                formatCurrency(c.profit),
                formatCurrency(c.spend),
                `${c.roiPct.toFixed(0)}%`,
              ])}
            />
          </AnalyticsBlock>
          <AnalyticsBlock id="profitability-leaks" title="Profit Leaks">
            <DataView headers={["Area", "Amount", "Reason"]} rows={data.profitability.highlights.profitLeaks.map((l) => [l.area, formatCurrency(l.amount), l.reason])} />
          </AnalyticsBlock>
          <AnalyticsBlock id="profitability-ai" title="AI analysis">
            <SectionAnalysisPanel section="profitability" questions={data.profitability.questions} />
          </AnalyticsBlock>
        </AnalyticsTabShell>
      )}

      {canAccessAnalyticsTab(plan, tab) && tab === "external" && (
        <AnalyticsTabShell tabId="external">
          <AnalyticsBlock
            id="external-intro"
            title="About external factors"
            defaultOpen
            description="Tracks weather, events, holidays, sports, tourism, and school schedules — learns patterns automatically."
            headerActions={
              <Button size="sm" variant="secondary" onClick={syncWeather} disabled={weatherSyncing}>
                {weatherSyncing ? "Syncing…" : "Sync weather & holidays"}
              </Button>
            }
          >
            <span className="sr-only">External factors overview</span>
          </AnalyticsBlock>
          <AnalyticsBlock id="external-metrics" title="Key metrics" defaultOpen>
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
          </AnalyticsBlock>
          <AnalyticsBlock id="external-intel" title="External Factors Intelligence" className="border-blue-100 bg-blue-50/50">
            <div className="grid gap-4 lg:grid-cols-3">
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
          </AnalyticsBlock>
          <AnalyticsBlock id="external-category-coverage" title="Category coverage">
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
          </AnalyticsBlock>
          <AnalyticsBlock id="external-weather-forecast" title="7-Day Weather Forecast">
            <DataView
              headers={["Date", "Condition", "Precip %", "High/Low"]}
              rows={data.externalFactors.weatherForecast.map((f) => [
                f.date,
                f.condition,
                `${f.precipitationPct}%`,
                `${f.tempHigh}° / ${f.tempLow}°`,
              ])}
            />
          </AnalyticsBlock>
          <AnalyticsBlock id="external-learned-patterns" title="Learned Patterns (Automatic)">
            <ul className="space-y-2 text-sm text-slate-600">
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
          </AnalyticsBlock>
          <AnalyticsBlock id="external-by-category" title="By Category">
            <DataView
              headers={["Category", "Count", "Avg Impact"]}
              rows={data.externalFactors.byCategory.map((c) => [c.category, c.count, `${c.avgImpactPct.toFixed(0)}%`])}
            />
          </AnalyticsBlock>
          <AnalyticsBlock id="external-recorded-factors" title="Recorded Factors">
            <DataView
              headers={["Date", "Category", "Impact", "Description"]}
              rows={data.externalFactors.factors.map((f) => [
                f.date.split("T")[0],
                f.category,
                `${f.impactPct}%`,
                f.description.length > 48 ? `${f.description.slice(0, 48)}…` : f.description,
              ])}
            />
          </AnalyticsBlock>
          <AnalyticsBlock id="external-ai" title="AI analysis">
            <SectionAnalysisPanel section="external" questions={data.externalFactors.questions} />
          </AnalyticsBlock>
        </AnalyticsTabShell>
      )}

      <div className="mt-8">
        <AnalyticsBlock id="coverage" title="Coverage checklist">
          <div className="flex flex-wrap gap-2">
            {data.coverage.sections.map((s) => (
              <Badge
                key={s.id}
                className={s.covered ? "bg-green-100 text-green-800" : "bg-slate-100 text-slate-500"}
              >
                {s.label} {s.covered ? "✓" : "—"}
              </Badge>
            ))}
          </div>
        </AnalyticsBlock>
      </div>
    </div>
    </AnalyticsViewModeProvider>
  );
}
