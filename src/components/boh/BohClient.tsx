"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Ban, Clock, Minus, Plus, RefreshCw, RotateCcw } from "lucide-react";
import { Button, Badge } from "@/components/ui";
import { Input, Select, FormField, Modal } from "@/components/ui/form";
import { useAuth } from "@/components/auth/AuthProvider";
import { apiPatch, apiPost, apiDelete } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useMenuSync } from "@/hooks/useMenuSync";

interface MenuItemRow {
  id: string;
  name: string;
  category: string;
  price: number;
  available: boolean;
  stockCount: number | null;
  eightySixedAt: string | null;
}

interface ScheduleRule {
  id: string;
  name: string;
  mode: "SHOW_CATEGORIES" | "HIDE_CATEGORIES" | "HAPPY_HOUR";
  categories: string;
  daysOfWeek: string;
  startTime: string;
  endTime: string;
  priceMultiplier: number;
  active: boolean;
}

interface BohPayload {
  menuRevision: number;
  items: MenuItemRow[];
  activeDayparts: { id: string; name: string; mode: string }[];
  schedules: ScheduleRule[];
}

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function BohClient() {
  const { can } = useAuth();
  const canSchedules = can("manage_menu");
  const [data, setData] = useState<BohPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [scheduleForm, setScheduleForm] = useState({
    name: "",
    mode: "SHOW_CATEGORIES" as ScheduleRule["mode"],
    categories: "Breakfast",
    daysOfWeek: "1,2,3,4,5,6,0",
    startTime: "07:00",
    endTime: "11:00",
    priceMultiplier: "1",
  });

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/boh/menu");
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useMenuSync(data?.menuRevision, load, true);

  const daypartLabel = useMemo(
    () => data?.activeDayparts?.map((d) => d.name).join(" · ") || null,
    [data?.activeDayparts]
  );

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const items = data?.items ?? [];
    if (!q) return items;
    return items.filter(
      (i) =>
        i.name.toLowerCase().includes(q) || i.category.toLowerCase().includes(q)
    );
  }, [data?.items, filter]);

  const handle86 = async (item: MenuItemRow) => {
    setSavingId(item.id);
    try {
      await apiPatch(`/api/boh/menu/${item.id}`, { eightySix: item.available });
      await load();
    } finally {
      setSavingId(null);
    }
  };

  const adjustStock = async (item: MenuItemRow, delta: number) => {
    if (item.stockCount === null) return;
    setSavingId(item.id);
    try {
      await apiPatch(`/api/boh/menu/${item.id}`, {
        stockCount: Math.max(0, item.stockCount + delta),
      });
      await load();
    } finally {
      setSavingId(null);
    }
  };

  const setStock = async (item: MenuItemRow, value: string) => {
    setSavingId(item.id);
    try {
      const count = value === "" ? null : parseInt(value, 10);
      await apiPatch(`/api/boh/menu/${item.id}`, { stockCount: count });
      await load();
    } finally {
      setSavingId(null);
    }
  };

  const createSchedule = async () => {
    await apiPost("/api/boh/schedules", {
      ...scheduleForm,
      priceMultiplier: parseFloat(scheduleForm.priceMultiplier) || 1,
    });
    setScheduleOpen(false);
    await load();
  };

  const toggleSchedule = async (rule: ScheduleRule) => {
    await apiPatch(`/api/boh/schedules/${rule.id}`, { active: !rule.active });
    await load();
  };

  const deleteSchedule = async (id: string) => {
    if (!confirm("Delete this schedule rule?")) return;
    await apiDelete(`/api/boh/schedules/${id}`);
    await load();
  };

  if (loading && !data) {
    return <p className="py-12 text-center text-slate-500">Loading BOH controls…</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-white p-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Live menu sync
          </p>
          <p className="text-sm text-slate-700">
            Revision <strong>{data?.menuRevision ?? 0}</strong> · updates every 5s across POS &
            ordering
          </p>
          {daypartLabel && (
            <p className="mt-1 flex items-center gap-1 text-sm text-orange-700">
              <Clock className="h-4 w-4" />
              Active: {daypartLabel}
            </p>
          )}
        </div>
        <Button variant="secondary" size="sm" onClick={load}>
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
      </div>

      <Input
        placeholder="Search items to 86 or set stock…"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
      />

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((item) => {
          const is86 = !item.available;
          const busy = savingId === item.id;
          return (
            <div
              key={item.id}
              className={cn(
                "rounded-xl border p-3",
                is86 ? "border-red-200 bg-red-50/50" : "border-slate-200 bg-white"
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-slate-900">{item.name}</p>
                  <p className="text-xs text-slate-500">{item.category}</p>
                </div>
                {is86 ? (
                  <Badge className="bg-red-100 text-red-800">86</Badge>
                ) : item.stockCount !== null ? (
                  <Badge className="bg-slate-800 text-white">{item.stockCount} left</Badge>
                ) : null}
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant={is86 ? "secondary" : "primary"}
                  className={!is86 ? "bg-red-600 hover:bg-red-700" : ""}
                  disabled={busy}
                  onClick={() => handle86(item)}
                >
                  {is86 ? (
                    <>
                      <RotateCcw className="h-3 w-3" />
                      Restore
                    </>
                  ) : (
                    <>
                      <Ban className="h-3 w-3" />
                      86 now
                    </>
                  )}
                </Button>

                {item.stockCount !== null ? (
                  <div className="flex items-center gap-1">
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={busy}
                      onClick={() => adjustStock(item, -1)}
                    >
                      <Minus className="h-3 w-3" />
                    </Button>
                    <span className="min-w-[2rem] text-center text-sm font-bold">
                      {item.stockCount}
                    </span>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={busy}
                      onClick={() => adjustStock(item, 1)}
                    >
                      <Plus className="h-3 w-3" />
                    </Button>
                  </div>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => setStock(item, "6")}
                  >
                    + Limit stock
                  </Button>
                )}
              </div>

              {item.stockCount !== null && (
                <FormField label="Exact count" className="mt-2">
                  <Input
                    type="number"
                    min={0}
                    defaultValue={item.stockCount}
                    disabled={busy}
                    onBlur={(e) => {
                      const v = e.target.value;
                      if (v !== String(item.stockCount)) setStock(item, v);
                    }}
                  />
                </FormField>
              )}
            </div>
          );
        })}
      </div>

      {canSchedules && (
        <section className="rounded-xl border bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-bold text-slate-900">Dayparting & scheduled menus</h2>
              <p className="text-sm text-slate-600">
                Auto-show/hide categories and happy hour pricing by time and day.
              </p>
            </div>
            <Button size="sm" onClick={() => setScheduleOpen(true)}>
              Add rule
            </Button>
          </div>
          <ul className="mt-4 space-y-2">
            {(data?.schedules ?? []).map((rule) => (
              <li
                key={rule.id}
                className="flex flex-col gap-2 rounded-lg bg-slate-50 p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-medium text-slate-900">
                    {rule.name}{" "}
                    <span className="text-xs font-normal text-slate-500">({rule.mode})</span>
                  </p>
                  <p className="text-xs text-slate-600">
                    {rule.categories} · {rule.startTime}–{rule.endTime} ·{" "}
                    {rule.daysOfWeek
                      .split(",")
                      .map((d) => DAY_LABELS[parseInt(d, 10)] ?? d)
                      .join(", ")}
                    {rule.mode === "HAPPY_HOUR" && ` · ${Math.round(rule.priceMultiplier * 100)}% price`}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="secondary" onClick={() => toggleSchedule(rule)}>
                    {rule.active ? "Pause" : "Enable"}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => deleteSchedule(rule.id)}>
                    Delete
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <Modal
        open={scheduleOpen}
        onClose={() => setScheduleOpen(false)}
        title="New schedule rule"
        size="lg"
      >
        <div className="space-y-3">
          <FormField label="Name">
            <Input
              value={scheduleForm.name}
              onChange={(e) => setScheduleForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Breakfast"
            />
          </FormField>
          <FormField label="Rule type">
            <Select
              value={scheduleForm.mode}
              onChange={(e) =>
                setScheduleForm((f) => ({
                  ...f,
                  mode: e.target.value as ScheduleRule["mode"],
                }))
              }
            >
              <option value="SHOW_CATEGORIES">Show only these categories</option>
              <option value="HIDE_CATEGORIES">Hide these categories</option>
              <option value="HAPPY_HOUR">Happy hour pricing</option>
            </Select>
          </FormField>
          <FormField label="Categories (comma-separated)">
            <Input
              value={scheduleForm.categories}
              onChange={(e) => setScheduleForm((f) => ({ ...f, categories: e.target.value }))}
              placeholder="Breakfast or Cocktails,Beer"
            />
          </FormField>
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label="Start time">
              <Input
                type="time"
                value={scheduleForm.startTime}
                onChange={(e) => setScheduleForm((f) => ({ ...f, startTime: e.target.value }))}
              />
            </FormField>
            <FormField label="End time">
              <Input
                type="time"
                value={scheduleForm.endTime}
                onChange={(e) => setScheduleForm((f) => ({ ...f, endTime: e.target.value }))}
              />
            </FormField>
          </div>
          {scheduleForm.mode === "HAPPY_HOUR" && (
            <FormField label="Price multiplier (0.8 = 20% off)">
              <Input
                value={scheduleForm.priceMultiplier}
                onChange={(e) =>
                  setScheduleForm((f) => ({ ...f, priceMultiplier: e.target.value }))
                }
              />
            </FormField>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setScheduleOpen(false)}>
              Cancel
            </Button>
            <Button onClick={createSchedule}>Save rule</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
