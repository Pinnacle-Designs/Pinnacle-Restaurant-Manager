"use client";

import { Fragment, useState, useEffect, useCallback, useMemo } from "react";
import {
  DollarSign,
  Scissors,
  AlertTriangle,
  RefreshCw,
  Loader2,
  Printer,
  TrendingDown,
  TrendingUp,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  UtensilsCrossed,
} from "lucide-react";
import { Button, Badge, StatCard, ScrollableTabs, TabPill } from "@/components/ui";
import { PageSectionShell, PageSection } from "@/components/layout/PageSections";
import { formatCurrency } from "@/lib/utils";
import { formatYieldNote } from "@/lib/kitchen/yield";
import { DAYPART_SHORT, MEAL_DAYPARTS } from "@/lib/kitchen/daypart";
import { formatPortionLabel, roundKitchenQty, scaleRecipeQty } from "@/lib/kitchen/portion";
import { filterBySearchQuery } from "@/lib/search/text-match";
import { usePageSearch } from "@/hooks/usePageSearch";

interface CostLine {
  ingredient: string;
  rawQty: number;
  unit: string;
  yieldPct: number;
  sellableQty: number;
  portionSize: number | null;
  portionLabel: string;
  lineCost: number;
}

interface MenuCostRow {
  id: string;
  name: string;
  category: string;
  price: number;
  recipeCost: number;
  margin: number;
  marginPct: number;
  allergens: string[];
  lines: CostLine[];
}

interface PrepIngredientLine {
  ingredient: string;
  unit: string;
  perPlateQty: number;
  perPlateLabel: string;
  portionSize: number | null;
  rawQtyNeeded: number;
  sellableQtyNeeded: number;
  prepQty: number;
  yieldPct: number;
  onHand: number;
  priority: string;
}

interface PrepMenuItem {
  menuItemId: string;
  menuItemName: string;
  category: string;
  forecastPlates: number;
  trendVsWeekAvgPct: number;
  portionSpec: string;
  platingNotes: string;
  plateware: string | null;
  garnish: string | null;
  ingredients: PrepIngredientLine[];
}

interface KitchenRecipeLine {
  ingredient: string;
  unit: string;
  perPlateQty: number;
  perPlateLabel: string;
  portionSize: number | null;
  yieldPct: number;
  scaledSellableQty: number;
  scaledRawQty: number;
  scaledLabel: string;
}

interface KitchenRecipeSpec {
  menuItemId: string;
  name: string;
  category: string;
  portionSpec: string;
  platingNotes: string;
  plateware: string | null;
  garnish: string | null;
  forecastPlates: number;
  lines: KitchenRecipeLine[];
}

interface PrepTask {
  ingredient: string;
  unit: string;
  rawQtyNeeded: number;
  sellableQtyNeeded: number;
  onHand: number;
  prepQty: number;
  carryoverQty?: number;
  availableQty?: number;
  stillNeedQty?: number;
  yieldPct: number;
  forMenuItems: string[];
  priority: string;
  daypart: string;
}

interface PrepDaypartBlock {
  daypart: string;
  label: string;
  forecastCovers: number;
  trendVsWeekAvgPct: number;
  menuItems: PrepMenuItem[];
  tasks: PrepTask[];
}

interface PrepTotalBlock {
  label: string;
  forecastCovers: number;
  breakfastCovers: number;
  lunchCovers: number;
  dinnerCovers: number;
  carryoverFromDate?: string;
  tasks: PrepTask[];
}

interface PrepList {
  date: string;
  dayOfWeek: string;
  forecastCovers: number;
  menuItems: PrepMenuItem[];
  totalPrep: PrepTotalBlock;
  dayparts: PrepDaypartBlock[];
  tasks: PrepTask[];
  summary: string;
  aiInsight: string;
}

type Tab = "costing" | "yield" | "prep" | "recipes" | "allergens";

function scaleRecipeSpecLocal(spec: KitchenRecipeSpec, plates: number): KitchenRecipeSpec {
  const count = Math.max(0.5, plates);
  return {
    ...spec,
    forecastPlates: roundKitchenQty(count),
    lines: spec.lines.map((line) => {
      const scaledSellable = scaleRecipeQty(line.perPlateQty, count);
      const scaledRaw = roundKitchenQty(scaledSellable / (line.yieldPct / 100));
      return {
        ...line,
        scaledSellableQty: scaledSellable,
        scaledRawQty: scaledRaw,
        scaledLabel: formatPortionLabel(scaledSellable, line.unit, line.portionSize),
      };
    }),
  };
}

function TotalPrepSection({ total }: { total: PrepTotalBlock }) {
  const hasCarryover = total.tasks.some((t) => (t.carryoverQty ?? 0) > 0);

  return (
    <div className="rounded-xl border-2 border-orange-200 bg-orange-50/40">
      <div className="border-b border-orange-200 px-4 py-3">
        <div className="flex flex-wrap gap-2 text-sm">
          <Badge className="bg-white text-slate-800">~{total.forecastCovers} covers total</Badge>
          <Badge className="bg-amber-100 text-amber-900">Breakfast {total.breakfastCovers}</Badge>
          <Badge className="bg-orange-100 text-orange-900">Lunch {total.lunchCovers}</Badge>
          <Badge className="bg-indigo-100 text-indigo-900">Dinner {total.dinnerCovers}</Badge>
          {hasCarryover && total.carryoverFromDate && (
            <Badge className="bg-emerald-100 text-emerald-900">
              Leftover prep from {total.carryoverFromDate}
            </Badge>
          )}
        </div>
        {hasCarryover && (
          <p className="mt-2 text-xs text-slate-600">
            Unsold prep from yesterday (forecast minus sales) counts toward today&apos;s available stock — use
            lined product first before pulling new.
          </p>
        )}
      </div>
      {total.tasks.length === 0 ? (
        <p className="px-4 py-6 text-sm text-slate-600">
          No recipe ingredients forecast for breakfast, lunch, or dinner on this day.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-white/80 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-2">Ingredient</th>
                <th className="px-4 py-2">Prep for full day</th>
                <th className="px-4 py-2">Sellable output</th>
                {hasCarryover && <th className="px-4 py-2">Leftover</th>}
                <th className="px-4 py-2">On hand</th>
                <th className="px-4 py-2">Still need</th>
                <th className="px-4 py-2">Menu items</th>
              </tr>
            </thead>
            <tbody>
              {total.tasks.map((task) => {
                const carryover = task.carryoverQty ?? 0;
                const stillNeed =
                  task.stillNeedQty ?? Math.max(0, roundKitchenQty(task.prepQty - task.onHand - carryover));
                return (
                  <tr
                    key={task.ingredient}
                    className={`border-t border-orange-100 ${task.priority === "HIGH" ? "bg-orange-50" : "bg-white/60"}`}
                  >
                    <td className="px-4 py-2.5 font-medium text-slate-900">
                      {task.ingredient}
                      {task.priority === "HIGH" && (
                        <Badge className="ml-2 bg-orange-200 text-orange-900">Low stock</Badge>
                      )}
                    </td>
                    <td className="px-4 py-2.5 font-semibold text-slate-900">
                      {task.prepQty} {task.unit}
                      {task.yieldPct < 100 && (
                        <span className="block text-xs font-normal text-slate-500">
                          {task.rawQtyNeeded} {task.unit} raw @ {task.yieldPct}% yield
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-slate-600">
                      {task.sellableQtyNeeded} {task.unit}
                      {task.yieldPct < 100 && (
                        <span className="block text-xs text-slate-500">
                          after {formatYieldNote(task.rawQtyNeeded, task.yieldPct, task.unit)}
                        </span>
                      )}
                    </td>
                    {hasCarryover && (
                      <td className="px-4 py-2.5 text-emerald-800">
                        {carryover > 0 ? (
                          <span className="font-medium">
                            {carryover} {task.unit}
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                    )}
                    <td className="px-4 py-2.5 text-slate-600">
                      {task.onHand} {task.unit}
                    </td>
                    <td className="px-4 py-2.5">
                      {stillNeed > 0 ? (
                        <span className="font-medium text-orange-800">
                          {stillNeed} {task.unit}
                        </span>
                      ) : (
                        <span className="text-emerald-700">Covered</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-slate-500">
                      {task.forMenuItems.slice(0, 3).join(", ")}
                      {task.forMenuItems.length > 3 ? ` +${task.forMenuItems.length - 3}` : ""}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function PrepMenuItemCard({ item, showPlating = true }: { item: PrepMenuItem; showPlating?: boolean }) {
  return (
    <article className="rounded-lg border border-slate-200 bg-white">
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 px-4 py-3">
        <div>
          <p className="font-semibold text-slate-900">{item.menuItemName}</p>
          <p className="text-xs text-slate-500">{item.category}</p>
          {showPlating && item.portionSpec && (
            <p className="mt-1 text-xs text-orange-800">{item.portionSpec}</p>
          )}
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Badge className="bg-slate-100 text-slate-800">~{item.forecastPlates} plates</Badge>
          {item.trendVsWeekAvgPct !== 0 && (
            <span className={item.trendVsWeekAvgPct > 0 ? "text-emerald-700" : "text-amber-700"}>
              {item.trendVsWeekAvgPct > 0 ? "+" : ""}
              {item.trendVsWeekAvgPct}%
            </span>
          )}
        </div>
      </div>
      {showPlating && (item.platingNotes || item.plateware) && (
        <div className="border-b border-slate-100 bg-orange-50/50 px-4 py-2.5 text-xs text-slate-700">
          {item.plateware && (
            <p>
              <UtensilsCrossed className="mr-1 inline h-3.5 w-3.5 text-orange-600" />
              {item.plateware}
              {item.garnish ? ` · ${item.garnish}` : ""}
            </p>
          )}
          {item.platingNotes && <p className="mt-1 leading-relaxed">{item.platingNotes}</p>}
        </div>
      )}
      {item.ingredients.length === 0 ? (
        <p className="px-4 py-3 text-sm text-slate-500">No recipe linked — add ingredients on the Menu page.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-2">Ingredient</th>
                <th className="px-4 py-2">Per plate</th>
                <th className="px-4 py-2">Prep total</th>
              </tr>
            </thead>
            <tbody>
              {item.ingredients.map((ing) => (
                <tr key={ing.ingredient} className="border-t border-slate-100">
                  <td className="px-4 py-2 font-medium text-slate-800">{ing.ingredient}</td>
                  <td className="px-4 py-2 text-slate-600">{ing.perPlateLabel}</td>
                  <td className="px-4 py-2 text-slate-800">
                    <strong>{ing.prepQty} {ing.unit}</strong> raw
                    {ing.yieldPct < 100 && (
                      <span className="block text-xs text-slate-500">
                        → {formatYieldNote(ing.prepQty, ing.yieldPct, ing.unit)}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </article>
  );
}

function RecipeSpecCard({
  spec,
  plateCount,
  onPlateCountChange,
}: {
  spec: KitchenRecipeSpec;
  plateCount: number;
  onPlateCountChange: (n: number) => void;
}) {
  const scaled = scaleRecipeSpecLocal(spec, plateCount);
  const fromPrep = spec.forecastPlates > 0 && plateCount === spec.forecastPlates;

  return (
    <article className="rounded-lg border border-slate-200 bg-white">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <div>
          <p className="font-semibold text-slate-900">{spec.name}</p>
          <p className="text-xs text-slate-500">{spec.category}</p>
          <p className="mt-1 text-xs font-medium text-orange-800">{spec.portionSpec}</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <label className="text-xs text-slate-500">
            Plate count
            {fromPrep && <span className="ml-1 text-indigo-600">(from prep list)</span>}
          </label>
          <input
            type="number"
            min={0.5}
            step={0.5}
            value={plateCount}
            onChange={(e) => onPlateCountChange(parseFloat(e.target.value) || 1)}
            className="w-20 rounded border border-slate-200 px-2 py-1 text-right text-sm"
          />
        </div>
      </div>
      {(spec.platingNotes || spec.plateware) && (
        <div className="border-b border-slate-100 bg-slate-50 px-4 py-2.5 text-xs text-slate-700">
          {spec.plateware && (
            <p className="font-medium">
              {spec.plateware}
              {spec.garnish ? ` · Garnish: ${spec.garnish}` : ""}
            </p>
          )}
          <p className="mt-1 leading-relaxed">{spec.platingNotes}</p>
        </div>
      )}
      {scaled.lines.length === 0 ? (
        <p className="px-4 py-3 text-sm text-slate-500">Build recipe on Menu → Edit item.</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-2">Ingredient</th>
              <th className="px-4 py-2">Per plate</th>
              <th className="px-4 py-2">For {scaled.forecastPlates} plates</th>
            </tr>
          </thead>
          <tbody>
            {scaled.lines.map((line) => (
              <tr key={line.ingredient} className="border-t border-slate-100">
                <td className="px-4 py-2 font-medium">{line.ingredient}</td>
                <td className="px-4 py-2 text-slate-600">{line.perPlateLabel}</td>
                <td className="px-4 py-2">
                  <span className="font-medium text-slate-900">{line.scaledLabel}</span>
                  {line.yieldPct < 100 && (
                    <span className="block text-xs text-slate-500">
                      {line.scaledRawQty} {line.unit} raw @ {line.yieldPct}% yield
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </article>
  );
}

export function KitchenClient() {
  const [tab, setTab] = useState<Tab>("costing");
  const { query } = usePageSearch();
  const [costing, setCosting] = useState<MenuCostRow[]>([]);
  const [prepList, setPrepList] = useState<PrepList | null>(null);
  const [recipeSpecs, setRecipeSpecs] = useState<KitchenRecipeSpec[]>([]);
  const [plateOverrides, setPlateOverrides] = useState<Record<string, number>>({});
  const [prepDate, setPrepDate] = useState(() => new Date().toISOString().split("T")[0]!);
  const [allergenAlerts, setAllergenAlerts] = useState<{ title: string; description: string }[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [recalculating, setRecalculating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/kitchen?date=${prepDate}`);
      const data = await res.json();
      setCosting(data.costing ?? []);
      setPrepList(data.prepList ?? null);
      setRecipeSpecs(data.recipeSpecs ?? []);
      setPlateOverrides({});
      setAllergenAlerts(data.allergenAlerts ?? []);
    } finally {
      setLoading(false);
    }
  }, [prepDate]);

  useEffect(() => {
    load();
  }, [load]);

  const recalculate = async () => {
    setRecalculating(true);
    try {
      await fetch("/api/kitchen/costing", { method: "POST" });
      await load();
    } finally {
      setRecalculating(false);
    }
  };

  const shiftPrepDate = (days: number) => {
    const d = new Date(prepDate + "T12:00:00");
    d.setDate(d.getDate() + days);
    setPrepDate(d.toISOString().split("T")[0]!);
  };

  const printPrepList = () => {
    window.print();
  };

  const avgMargin =
    costing.length > 0
      ? costing.reduce((s, c) => s + c.marginPct, 0) / costing.length
      : 0;

  const filteredCosting = useMemo(
    () =>
      filterBySearchQuery(costing, query, (row) => [
        row.name,
        row.category,
        ...row.allergens,
        ...row.lines.map((line) => line.ingredient),
      ]),
    [costing, query]
  );

  const filteredRecipeSpecs = useMemo(
    () =>
      filterBySearchQuery(recipeSpecs, query, (spec) => [
        spec.name,
        spec.category,
        spec.platingNotes,
        spec.portionSpec,
        spec.plateware,
        spec.garnish,
      ]),
    [recipeSpecs, query]
  );
  const lowMargin = costing.filter((c) => c.marginPct < 60).length;

  const tabs: { id: Tab; label: string }[] = [
    { id: "costing", label: "Recipe Costing" },
    { id: "recipes", label: "Recipes & Plating" },
    { id: "yield", label: "Yield" },
    { id: "prep", label: "Prep List" },
    { id: "allergens", label: "Allergens" },
  ];

  const getPlateCount = (spec: KitchenRecipeSpec) =>
    plateOverrides[spec.menuItemId] ?? (spec.forecastPlates > 0 ? spec.forecastPlates : 1);

  const prepDateControls = (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="ghost" size="sm" onClick={() => shiftPrepDate(-1)} aria-label="Previous day">
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <input
        type="date"
        value={prepDate}
        onChange={(e) => setPrepDate(e.target.value)}
        className="rounded-lg border border-slate-200 px-2 py-1 text-sm"
      />
      <Button variant="ghost" size="sm" onClick={() => shiftPrepDate(1)} aria-label="Next day">
        <ChevronRight className="h-4 w-4" />
      </Button>
      <Button variant="secondary" onClick={printPrepList}>
        <Printer className="mr-2 h-4 w-4" />
        Print
      </Button>
    </div>
  );

  return (
    <div>
      <PageSectionShell pageId="kitchen-metrics">
        <PageSection id="kitchen-key-metrics" title="Key metrics" defaultOpen>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Menu items costed" value={costing.length} subtext="Live from inventory prices" />
            <StatCard label="Avg margin" value={`${avgMargin.toFixed(1)}%`} />
            <StatCard label="Below 60% margin" value={lowMargin} subtext="Review pricing" />
            <StatCard label="Ingredients to prep" value={prepList?.totalPrep.tasks.length ?? 0} subtext="B + L + D combined" />
          </div>
        </PageSection>
      </PageSectionShell>

      <div className="no-print mb-4 flex items-start gap-2 border-b border-slate-200 pb-2">
        <ScrollableTabs className="min-w-0 flex-1" menuLabel="Kitchen">
          {tabs.map((t) => (
            <TabPill key={t.id} id={t.id} active={tab === t.id} onClick={() => setTab(t.id)}>
              {t.label}
            </TabPill>
          ))}
        </ScrollableTabs>
        <Button variant="ghost" size="sm" onClick={load} className="hidden shrink-0 sm:inline-flex">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
        </div>
      ) : (
        <>
          {tab === "costing" && (
            <PageSectionShell pageId={`kitchen-${tab}`}>
              <PageSection
                id="kitchen-costing-table"
                title="Dynamic Recipe Costing"
                description="Margins update automatically when vendor invoices change ingredient prices"
                defaultOpen
                headerActions={
                  <Button onClick={recalculate} disabled={recalculating} size="sm">
                    {recalculating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <DollarSign className="mr-2 h-4 w-4" />}
                    Recalculate all
                  </Button>
                }
              >
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-slate-500">
                      <th className="pb-2 pr-4">Item</th>
                      <th className="pb-2 pr-4">Price</th>
                      <th className="pb-2 pr-4">Food cost</th>
                      <th className="pb-2 pr-4">Margin</th>
                      <th className="pb-2">Allergens</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCosting.map((row) => (
                      <Fragment key={row.id}>
                        <tr
                          className="cursor-pointer border-b border-slate-100 hover:bg-slate-50"
                          onClick={() => setExpandedId(expandedId === row.id ? null : row.id)}
                        >
                          <td className="py-3 pr-4 font-medium">{row.name}</td>
                          <td className="py-3 pr-4">{formatCurrency(row.price)}</td>
                          <td className="py-3 pr-4 text-orange-700">{formatCurrency(row.recipeCost)}</td>
                          <td className="py-3 pr-4">
                            <span className={row.marginPct < 60 ? "text-red-600" : "text-green-700"}>
                              {row.marginPct.toFixed(1)}%
                              {row.marginPct < 60 ? (
                                <TrendingDown className="ml-1 inline h-3 w-3" />
                              ) : (
                                <TrendingUp className="ml-1 inline h-3 w-3" />
                              )}
                            </span>
                          </td>
                          <td className="py-3">
                            {row.allergens.length > 0 ? (
                              <div className="flex flex-wrap gap-1">
                                {row.allergens.map((a) => (
                                  <Badge key={a} className="bg-amber-100 text-amber-800 text-xs">
                                    {a}
                                  </Badge>
                                ))}
                              </div>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                        </tr>
                        {expandedId === row.id && row.lines.length > 0 && (
                          <tr className="bg-slate-50">
                            <td colSpan={5} className="px-4 py-3">
                              <div className="space-y-1 text-xs text-slate-600">
                                {row.lines.map((l) => (
                                  <div key={l.ingredient} className="flex justify-between gap-4">
                                    <span>
                                      {l.ingredient}: {l.portionLabel}
                                      {l.yieldPct < 100 && (
                                        <span className="text-slate-400">
                                          {" "}
                                          ({formatYieldNote(l.rawQty, l.yieldPct, l.unit)} raw)
                                        </span>
                                      )}
                                    </span>
                                    <span>{formatCurrency(l.lineCost)}</span>
                                  </div>
                                ))}
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
              </PageSection>
            </PageSectionShell>
          )}

          {tab === "recipes" && (
            <PageSectionShell pageId={`kitchen-${tab}`}>
              <PageSection
                id="kitchen-recipes-intro"
                title="Recipes, portions & plating"
                description={`Per-plate builds with standard portion sizes. Plate counts default from the prep list forecast for ${prepList?.dayOfWeek ?? "today"} — adjust any item to scale ingredient totals.`}
                defaultOpen
              >
                <p className="sr-only">Recipe builds below</p>
              </PageSection>
              {filteredRecipeSpecs
                .filter((s) => s.lines.length > 0)
                .map((spec) => (
                  <PageSection key={spec.menuItemId} id={`kitchen-recipe-${spec.menuItemId}`} title={spec.name}>
                    <RecipeSpecCard
                      spec={spec}
                      plateCount={getPlateCount(spec)}
                      onPlateCountChange={(n) =>
                        setPlateOverrides((prev) => ({ ...prev, [spec.menuItemId]: n }))
                      }
                    />
                  </PageSection>
                ))}
              {filteredRecipeSpecs.every((s) => s.lines.length === 0) && (
                <PageSection id="kitchen-recipes-empty" title="Recipes">
                  <p className="text-slate-500">Add recipes on the Menu page to see builds here.</p>
                </PageSection>
              )}
            </PageSectionShell>
          )}

          {tab === "yield" && (
            <PageSectionShell pageId={`kitchen-${tab}`}>
              <PageSection
                id="kitchen-yield"
                title="Yield Management"
                description="Raw ingredients lose weight to trim and cook loss before they reach the guest."
                defaultOpen
              >
                <div className="space-y-4">
                {costing
                  .flatMap((c) =>
                    c.lines
                      .filter((l) => l.yieldPct < 100)
                      .map((l) => ({ menuItem: c.name, ...l }))
                  )
                  .map((l) => (
                    <div key={`${l.menuItem}-${l.ingredient}`} className="rounded-lg border border-slate-200 p-4">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-medium">{l.ingredient}</p>
                          <p className="text-sm text-slate-500">Used in {l.menuItem}</p>
                        </div>
                        <Badge className="bg-blue-100 text-blue-800">{l.yieldPct}% yield</Badge>
                      </div>
                      <p className="mt-2 text-sm">
                        <Scissors className="mr-1 inline h-4 w-4 text-slate-400" />
                        {formatYieldNote(l.rawQty, l.yieldPct, l.unit)} per plate
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        Example: 10 {l.unit} raw brisket → {(10 * (l.yieldPct / 100)).toFixed(1)} {l.unit}{" "}
                        sellable at {l.yieldPct}% yield
                      </p>
                    </div>
                  ))}
                {costing.every((c) => c.lines.every((l) => l.yieldPct >= 100)) && (
                  <p className="text-slate-500">Set yield % on inventory items to see trim/cook loss here.</p>
                )}
                </div>
              </PageSection>
            </PageSectionShell>
          )}

          {tab === "prep" && prepList && (
            <PageSectionShell pageId={`kitchen-${tab}`}>
              <div className="print:shadow-none" id="prep-list">
                <PageSection
                  id="kitchen-prep-header"
                  title={`Prep List — ${prepList.dayOfWeek}, ${prepList.date}`}
                  description={prepList.summary}
                  defaultOpen
                  headerActions={prepDateControls}
                >
                  <p className="sr-only">Prep list sections below</p>
                </PageSection>

                {prepList.aiInsight && (
                  <PageSection id="kitchen-prep-ai" title="AI analysis">
                    <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-900">
                      <p className="flex items-start gap-2 font-medium">
                        <Sparkles className="mt-0.5 h-4 w-4 shrink-0" />
                        Auto-generated from day-of-week &amp; meal-period trends
                      </p>
                      <p className="mt-1 text-indigo-800">{prepList.aiInsight}</p>
                    </div>
                  </PageSection>
                )}

                {prepList.totalPrep && (
                  <PageSection id="kitchen-prep-total" title={prepList.totalPrep.label}>
                    <TotalPrepSection total={prepList.totalPrep} />
                  </PageSection>
                )}

                {prepList.menuItems.length > 0 && (
                  <PageSection id="kitchen-prep-menu-items" title="By menu item — full day">
                    <div className="space-y-3">
                      {prepList.menuItems.map((item) => (
                        <PrepMenuItemCard key={item.menuItemId} item={item} />
                      ))}
                    </div>
                  </PageSection>
                )}

                {prepList.dayparts
                  .filter((block) => MEAL_DAYPARTS.includes(block.daypart as (typeof MEAL_DAYPARTS)[number]))
                  .map((block) => (
                    <PageSection
                      key={block.daypart}
                      id={`kitchen-prep-${block.daypart}`}
                      title={DAYPART_SHORT[block.daypart as keyof typeof DAYPART_SHORT] ?? block.daypart}
                      description={block.label}
                    >
                      <div className="mb-3 flex flex-wrap items-center justify-end gap-3 text-sm">
                        <span className="text-slate-600">~{block.forecastCovers} covers</span>
                        {block.trendVsWeekAvgPct !== 0 && (
                          <span
                            className={
                              block.trendVsWeekAvgPct > 0 ? "text-emerald-700" : "text-amber-700"
                            }
                          >
                            {block.trendVsWeekAvgPct > 0 ? (
                              <TrendingUp className="mr-0.5 inline h-3.5 w-3.5" />
                            ) : (
                              <TrendingDown className="mr-0.5 inline h-3.5 w-3.5" />
                            )}
                            {block.trendVsWeekAvgPct > 0 ? "+" : ""}
                            {block.trendVsWeekAvgPct}% vs weekly avg
                          </span>
                        )}
                      </div>
                      {block.menuItems.length === 0 ? (
                        <p className="text-sm text-slate-500">No forecasted sales for {block.daypart}.</p>
                      ) : (
                        <div className="space-y-3">
                          {block.menuItems.map((item) => (
                            <PrepMenuItemCard key={`${block.daypart}-${item.menuItemId}`} item={item} />
                          ))}
                        </div>
                      )}
                      {block.tasks.length > 0 && (
                        <details className="mt-4 rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-3">
                          <summary className="cursor-pointer text-sm font-medium text-slate-700">
                            Ingredient rollup ({block.tasks.length} net prep after on-hand)
                          </summary>
                          <div className="mt-3 space-y-2">
                            {block.tasks.map((task) => (
                              <div key={`${block.daypart}-rollup-${task.ingredient}`} className="text-sm text-slate-600">
                                <strong>{task.ingredient}</strong> — prep {task.prepQty} {task.unit}
                                {task.priority === "HIGH" && (
                                  <Badge className="ml-2 bg-orange-200 text-orange-900">Priority</Badge>
                                )}
                              </div>
                            ))}
                          </div>
                        </details>
                      )}
                    </PageSection>
                  ))}
              </div>
            </PageSectionShell>
          )}

          {tab === "allergens" && (
            <PageSectionShell pageId={`kitchen-${tab}`}>
              {allergenAlerts.length > 0 && (
                <PageSection id="kitchen-allergen-alerts" title="FOH alerts — vendor substitutions" defaultOpen>
                  {allergenAlerts.map((a, i) => (
                    <div key={i} className="mb-2 text-sm text-amber-800">
                      <p className="flex items-center gap-2 font-medium text-amber-900">
                        <AlertTriangle className="h-4 w-4" />
                        {a.title}
                      </p>
                      <p>{a.description}</p>
                    </div>
                  ))}
                </PageSection>
              )}
              <PageSection
                id="kitchen-allergen-tagging"
                title="Allergen & nutrition tagging"
                description="Allergens roll up from ingredients into each recipe. New vendor substitutions trigger Command Center alerts."
                defaultOpen={allergenAlerts.length === 0}
              >
                <div className="space-y-2">
                  {costing
                    .filter((c) => c.allergens.length > 0)
                    .map((c) => (
                      <div key={c.id} className="flex flex-wrap items-center justify-between rounded-lg border border-slate-100 px-3 py-2">
                        <span className="font-medium">{c.name}</span>
                        <div className="flex flex-wrap gap-1">
                          {c.allergens.map((a) => (
                            <Badge key={a} className="bg-red-100 text-red-800">
                              {a}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    ))}
                </div>
              </PageSection>
            </PageSectionShell>
          )}
        </>
      )}
    </div>
  );
}
