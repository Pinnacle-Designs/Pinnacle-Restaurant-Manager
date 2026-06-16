"use client";

import { Fragment, useState, useEffect, useCallback } from "react";
import {
  DollarSign,
  Scissors,
  AlertTriangle,
  RefreshCw,
  Loader2,
  Printer,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { Button, Badge, StatCard } from "@/components/ui";
import { formatCurrency } from "@/lib/utils";
import { formatYieldNote } from "@/lib/kitchen/prep-list";

interface CostLine {
  ingredient: string;
  rawQty: number;
  unit: string;
  yieldPct: number;
  sellableQty: number;
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

interface PrepTask {
  ingredient: string;
  unit: string;
  rawQtyNeeded: number;
  sellableQtyNeeded: number;
  onHand: number;
  prepQty: number;
  yieldPct: number;
  forMenuItems: string[];
  priority: string;
}

interface PrepList {
  date: string;
  forecastCovers: number;
  tasks: PrepTask[];
  summary: string;
}

type Tab = "costing" | "yield" | "prep" | "allergens";

export function KitchenClient() {
  const [tab, setTab] = useState<Tab>("costing");
  const [costing, setCosting] = useState<MenuCostRow[]>([]);
  const [prepList, setPrepList] = useState<PrepList | null>(null);
  const [allergenAlerts, setAllergenAlerts] = useState<{ title: string; description: string }[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [recalculating, setRecalculating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/kitchen");
      const data = await res.json();
      setCosting(data.costing ?? []);
      setPrepList(data.prepList ?? null);
      setAllergenAlerts(data.allergenAlerts ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

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

  const printPrepList = () => {
    window.print();
  };

  const avgMargin =
    costing.length > 0
      ? costing.reduce((s, c) => s + c.marginPct, 0) / costing.length
      : 0;
  const lowMargin = costing.filter((c) => c.marginPct < 60).length;

  const tabs: { id: Tab; label: string }[] = [
    { id: "costing", label: "Recipe Costing" },
    { id: "yield", label: "Yield" },
    { id: "prep", label: "Prep List" },
    { id: "allergens", label: "Allergens" },
  ];

  return (
    <div>
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Menu items costed" value={costing.length} subtext="Live from inventory prices" />
        <StatCard label="Avg margin" value={`${avgMargin.toFixed(1)}%`} />
        <StatCard label="Below 60% margin" value={lowMargin} subtext="Review pricing" />
        <StatCard label="Prep tasks today" value={prepList?.tasks.length ?? 0} />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2 border-b border-slate-200 pb-2">
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

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
        </div>
      ) : (
        <>
          {tab === "costing" && (
            <div className="card">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="font-semibold">Dynamic Recipe Costing</h2>
                  <p className="text-sm text-slate-500">
                    Margins update automatically when vendor invoices change ingredient prices
                  </p>
                </div>
                <Button onClick={recalculate} disabled={recalculating}>
                  {recalculating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <DollarSign className="mr-2 h-4 w-4" />}
                  Recalculate all
                </Button>
              </div>
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
                    {costing.map((row) => (
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
                                  <div key={l.ingredient} className="flex justify-between">
                                    <span>
                                      {l.ingredient}: {l.sellableQty} {l.unit} sellable
                                      {l.yieldPct < 100 && (
                                        <span className="text-slate-400">
                                          {" "}
                                          ({formatYieldNote(l.rawQty, l.yieldPct, l.unit)})
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
            </div>
          )}

          {tab === "yield" && (
            <div className="card">
              <h2 className="mb-2 font-semibold">Yield Management</h2>
              <p className="mb-4 text-sm text-slate-500">
                Raw ingredients lose weight to trim and cook loss before they reach the guest.
              </p>
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
            </div>
          )}

          {tab === "prep" && prepList && (
            <div className="card print:shadow-none" id="prep-list">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="font-semibold">Daily Prep List — {prepList.date}</h2>
                  <p className="text-sm text-slate-500">{prepList.summary}</p>
                </div>
                <Button variant="secondary" onClick={printPrepList}>
                  <Printer className="mr-2 h-4 w-4" />
                  Print
                </Button>
              </div>
              <div className="space-y-3">
                {prepList.tasks.length === 0 ? (
                  <p className="text-slate-500">On-hand stock covers forecasted sales.</p>
                ) : (
                  prepList.tasks.map((task) => (
                    <div
                      key={task.ingredient}
                      className={`rounded-lg border p-4 ${
                        task.priority === "HIGH" ? "border-orange-200 bg-orange-50" : "border-slate-200"
                      }`}
                    >
                      <div className="flex justify-between">
                        <p className="font-semibold">{task.ingredient}</p>
                        {task.priority === "HIGH" && (
                          <Badge className="bg-orange-200 text-orange-900">Priority</Badge>
                        )}
                      </div>
                      <p className="mt-1 text-sm">
                        Prep <strong>{task.prepQty} {task.unit}</strong> raw
                        {task.yieldPct < 100 && (
                          <span className="text-slate-600">
                            {" "}
                            → {formatYieldNote(task.prepQty, task.yieldPct, task.unit)}
                          </span>
                        )}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        On hand: {task.onHand} {task.unit} · Need: {task.rawQtyNeeded} {task.unit} raw for{" "}
                        {task.forMenuItems.join(", ")}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {tab === "allergens" && (
            <div className="space-y-4">
              {allergenAlerts.length > 0 && (
                <div className="card border-amber-200 bg-amber-50">
                  <h2 className="mb-3 flex items-center gap-2 font-semibold text-amber-900">
                    <AlertTriangle className="h-5 w-5" />
                    FOH alerts — vendor substitutions
                  </h2>
                  {allergenAlerts.map((a, i) => (
                    <div key={i} className="mb-2 text-sm text-amber-800">
                      <p className="font-medium">{a.title}</p>
                      <p>{a.description}</p>
                    </div>
                  ))}
                </div>
              )}
              <div className="card">
                <h2 className="mb-4 font-semibold">Allergen & nutrition tagging</h2>
                <p className="mb-4 text-sm text-slate-500">
                  Allergens roll up from ingredients into each recipe. New vendor substitutions trigger Command Center alerts.
                </p>
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
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
