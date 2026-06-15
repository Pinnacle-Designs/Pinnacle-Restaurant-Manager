"use client";

import { useCallback, useEffect, useMemo, useState, type ComponentType } from "react";
import Link from "next/link";
import {
  Flame,
  GripVertical,
  LayoutGrid,
  RefreshCw,
  UtensilsCrossed,
  Wallet,
  BellRing,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui";
import { cn, formatCurrency } from "@/lib/utils";
import { useAuth } from "@/components/auth/AuthProvider";
import { apiFetch, apiPatch, apiPost } from "@/lib/api";
import { PayCheckScreen, type PayableOrder } from "@/components/orders/PayCheckScreen";
import { SeatPicker } from "@/components/orders/SeatPicker";
import { PosItemGrid, type PosMenuItem } from "@/components/pos/PosItemGrid";
import { ModifierWizard } from "@/components/pos/ModifierWizard";
import { FractionalPieWizard } from "@/components/pos/FractionalPieWizard";
import { CoursePicker } from "@/components/pos/CoursePicker";
import {
  resolveModifierGroupsForItem,
  shouldOpenModifierWizard,
  hasFractionalPieLayout,
  type ModifierGroupConfig,
} from "@/lib/pos/modifiers";
import {
  getServeStepStates,
  pendingFireCount,
  pendingFireCountByCourse,
  SERVE_STEPS,
  serveStepLabel,
  type ServeStep,
  type ServeStepState,
} from "@/lib/pos/serve-flow";
import { MENU_COURSES, MENU_COURSE_SHORT, type MenuCourseId } from "@/lib/kitchen/courses";
import { useMenuSync } from "@/hooks/useMenuSync";

type Order = PayableOrder & {
  tableId?: string | null;
  items: (PayableOrder["items"][number] & {
    kitchenStatus?: string;
    seatNumber?: number | null;
    course?: string;
    routesToKitchen?: boolean;
    parentOrderItemId?: string | null;
    kitchenStation?: { id: string; name: string; slug: string } | null;
  })[];
};

interface ServerPosClientProps {
  onOrderUpdated?: (order: Order) => void;
}

interface PosConfig {
  menuRevision: number;
  menuItems: PosMenuItem[];
  activeDayparts: { id: string; name: string; mode: string }[];
  modifierGroups: (ModifierGroupConfig & { categories: string | null; menuItemId: string | null })[];
  categoryStyles: { category: string; color: string; icon: string | null }[];
  tables: { id: string; number: number; capacity: number }[];
  openOrders: Order[];
}

const STEP_ICONS: Record<ServeStep, ComponentType<{ className?: string }>> = {
  fire: Flame,
  ready: BellRing,
  served: UtensilsCrossed,
  pay: Wallet,
};

export function ServerPosClient(props: ServerPosClientProps = {}) {
  const { onOrderUpdated } = props;
  const { can } = useAuth();
  const canLayout = can("manage_menu");
  const canTakePayment = can("place_orders") || can("manage_orders");

  const [config, setConfig] = useState<PosConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<string>("All");
  const [layoutEdit, setLayoutEdit] = useState(false);
  const [pendingItem, setPendingItem] = useState<PosMenuItem | null>(null);
  const [pendingGroups, setPendingGroups] = useState<ModifierGroupConfig[]>([]);
  const [tapCount, setTapCount] = useState(0);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentOrder, setPaymentOrder] = useState<PayableOrder | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [activeSeat, setActiveSeat] = useState<number | null>(1);
  const [activeCourse, setActiveCourse] = useState<MenuCourseId>("MAIN");
  const [fractionalOpen, setFractionalOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/pos/config");
      const data = await res.json();
      setConfig(data);
      if (!activeOrderId && data.openOrders?.length > 0) {
        setActiveOrderId(data.openOrders[0].id);
      }
    } finally {
      setLoading(false);
    }
  }, [activeOrderId]);

  useEffect(() => {
    load();
  }, [load]);

  useMenuSync(config?.menuRevision, load, true);

  const daypartLabel =
    config?.activeDayparts?.map((d) => d.name).join(" · ") || null;

  const categoryStyleMap = useMemo(() => {
    const map: Record<string, { color: string; icon?: string | null }> = {};
    config?.categoryStyles.forEach((s) => {
      map[s.category] = { color: s.color, icon: s.icon };
    });
    return map;
  }, [config]);

  const categories = useMemo(() => {
    const cats = new Set(config?.menuItems.map((m) => m.category) ?? []);
    return ["All", ...Array.from(cats).sort()];
  }, [config]);

  const activeOrder = config?.openOrders.find((o) => o.id === activeOrderId) ?? null;
  const activeTable = activeOrder?.tableId
    ? config?.tables.find((t) => t.id === activeOrder.tableId) ?? null
    : null;
  const fireCount = pendingFireCount(activeOrder);
  const stepStates = getServeStepStates(activeOrder);

  useEffect(() => {
    if (!activeTable) {
      setActiveSeat(null);
      return;
    }
    setActiveSeat((prev) =>
      prev && prev <= activeTable.capacity ? prev : 1
    );
  }, [activeOrderId, activeTable?.id, activeTable?.capacity]);

  const isOrderClosed = (order: Order) =>
    order.checkStatus === "CLOSED" ||
    order.status === "PAID" ||
    order.status === "CANCELLED";

  const syncOrder = useCallback(
    (updated: Order) => {
      onOrderUpdated?.(updated);
      setConfig((prev) => {
        if (!prev) return prev;
        if (isOrderClosed(updated)) {
          const nextOpen = prev.openOrders.filter((o) => o.id !== updated.id);
          setActiveOrderId((current) =>
            current === updated.id ? (nextOpen[0]?.id ?? null) : current
          );
          return { ...prev, openOrders: nextOpen };
        }
        const exists = prev.openOrders.some((o) => o.id === updated.id);
        return {
          ...prev,
          openOrders: exists
            ? prev.openOrders.map((o) => (o.id === updated.id ? updated : o))
            : [updated, ...prev.openOrders],
        };
      });
      if (paymentOrder?.id === updated.id) {
        setPaymentOrder(updated);
      }
    },
    [onOrderUpdated, paymentOrder?.id]
  );

  const openOrCreateCheck = async (tableId: string | null) => {
    const existing = config?.openOrders.find((o) =>
      tableId ? o.tableId === tableId : !o.tableId
    );
    if (existing) {
      setActiveOrderId(existing.id);
      return existing.id;
    }
    const order = await apiPost<Order>("/api/orders", {
      tableId,
      totalAmount: 0,
      guestCount: tableId
        ? config?.tables.find((t) => t.id === tableId)?.capacity ?? 2
        : 2,
      channel: "dine-in",
      items: [],
    });
    syncOrder(order);
    setActiveOrderId(order.id);
    if (tableId) setActiveSeat(1);
    return order.id;
  };

  const addItemToCheck = async (
    item: PosMenuItem,
    extras?: {
      modifiers?: unknown[];
      modifierSummary?: string;
      priceDelta?: number;
      fireToKitchen?: boolean;
      course?: MenuCourseId;
    }
  ) => {
    let orderId = activeOrderId;
    if (!orderId) {
      orderId = await openOrCreateCheck(null);
    }
    const linePrice = item.price + (extras?.priceDelta ?? 0);
    const updated = await apiPost<Order>(`/api/orders/${orderId}/items`, {
      menuItemId: item.id,
      quantity: 1,
      price: linePrice,
      seatNumber: activeSeat ?? undefined,
      course: extras?.course ?? activeCourse,
      modifiers: extras?.modifiers,
      modifierSummary: extras?.modifierSummary,
      fireToKitchen: extras?.fireToKitchen ?? false,
    });
    syncOrder(updated);
    setTapCount((c) => c + 1);
  };

  const fireCourse = async (course: MenuCourseId) => {
    if (!activeOrderId || actionBusy) return;
    setActionBusy(true);
    try {
      await apiPost<Order>(`/api/orders/${activeOrderId}/fire`, { course }).then(syncOrder);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Could not fire course");
    } finally {
      setActionBusy(false);
    }
  };

  const handleItemTap = (item: PosMenuItem) => {
    if (activeTable && !activeSeat) {
      alert("Select a seat before adding items.");
      return;
    }
    const groups = resolveModifierGroupsForItem(item, config?.modifierGroups ?? []);
    if (shouldOpenModifierWizard(groups)) {
      setPendingItem(item);
      setPendingGroups(groups);
      setFractionalOpen(hasFractionalPieLayout(groups));
      setTapCount(1);
      return;
    }
    void addItemToCheck(item);
  };

  const handleModifierFire = (payload: {
    modifiers: unknown[];
    modifierSummary: string;
    price: number;
  }) => {
    if (!pendingItem) return;
    void addItemToCheck(pendingItem, {
      modifiers: payload.modifiers,
      modifierSummary: payload.modifierSummary,
      priceDelta: payload.price,
      fireToKitchen: true,
    });
    setPendingItem(null);
    setPendingGroups([]);
  };

  const advanceStatus = async (status: string) => {
    if (!activeOrderId) return;
    const updated = await apiPatch<Order>(`/api/orders/${activeOrderId}`, { status });
    syncOrder(updated);
  };

  const openPayment = async () => {
    if (!activeOrderId) return;
    const order = await apiFetch<PayableOrder>(`/api/orders/${activeOrderId}`);
    setPaymentOrder(order);
    setPaymentOpen(true);
  };

  const handleStepAction = async (step: ServeStep) => {
    if (!activeOrderId || actionBusy) return;
    const state = stepStates[step];
    if (state !== "active") return;
    if (step === "pay" && !canTakePayment) return;

    setActionBusy(true);
    try {
      switch (step) {
        case "fire":
          await apiPost<Order>(`/api/orders/${activeOrderId}/fire`, {}).then(syncOrder);
          break;
        case "ready":
          await advanceStatus("READY");
          break;
        case "served":
          await advanceStatus("SERVED");
          break;
        case "pay":
          await openPayment();
          break;
      }
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : "Could not complete action");
    } finally {
      setActionBusy(false);
    }
  };

  const saveLayout = async (items: PosMenuItem[]) => {
    await fetch("/api/pos/layout", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: items.map((item, idx) => ({ id: item.id, posGridIndex: idx })),
      }),
    });
    setConfig((prev) => {
      if (!prev) return prev;
      const byId = Object.fromEntries(items.map((i, idx) => [i.id, idx]));
      return {
        ...prev,
        menuItems: [...prev.menuItems]
          .map((m) => ({ ...m, posGridIndex: byId[m.id] ?? m.posGridIndex }))
          .sort((a, b) => (a.posGridIndex ?? 0) - (b.posGridIndex ?? 0)),
      };
    });
  };

  const stepButtonClass = (state: ServeStepState, step: ServeStep) =>
    cn(
      "mt-1.5 w-full justify-start gap-2 text-left text-sm",
      state === "active" &&
        (step === "fire"
          ? "bg-orange-500 hover:bg-orange-600"
          : step === "ready"
            ? "bg-green-600 hover:bg-green-700"
            : step === "served"
              ? "bg-purple-600 hover:bg-purple-700"
              : "bg-slate-900 hover:bg-slate-800"),
      state === "complete" &&
        "border border-green-200 bg-green-50 text-green-800 hover:bg-green-50",
      state === "upcoming" && "border border-slate-200 bg-slate-50 text-slate-400"
    );

  if (loading && !config) {
    return <p className="py-12 text-center text-slate-500">Loading POS…</p>;
  }

  return (
    <div className="flex min-h-[calc(100vh-8rem)] flex-col gap-4 lg:flex-row">
      {/* Ticket column */}
      <aside className="w-full shrink-0 rounded-xl border bg-white lg:w-72">
        <div className="border-b px-3 py-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Active check</p>
          <p className="font-bold text-slate-900">
            {activeOrder?.table ? `Table ${activeOrder.table.number}` : "Walk-in / Bar"}
          </p>
        </div>
        <div className="flex gap-1 overflow-x-auto border-b p-2">
          {config?.tables.map((t) => {
            const order = config.openOrders.find((o) => o.tableId === t.id);
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  if (order) {
                    setActiveOrderId(order.id);
                    setActiveSeat(1);
                  } else {
                    void openOrCreateCheck(t.id).then(() => setActiveSeat(1));
                  }
                }}
                className={cn(
                  "shrink-0 rounded-lg px-3 py-2 text-sm font-semibold",
                  activeOrder?.table?.number === t.number
                    ? "bg-orange-500 text-white"
                    : order
                      ? "bg-amber-100 text-amber-900"
                      : "bg-slate-100 text-slate-600"
                )}
              >
                T{t.number}
              </button>
            );
          })}
        </div>
        {activeTable && (
          <div className="border-b px-3 py-2">
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              Seat — T{activeTable.number}
            </p>
            <SeatPicker
              capacity={activeTable.capacity}
              value={activeSeat}
              onChange={setActiveSeat}
            />
          </div>
        )}
        <div className="border-b px-3 py-2">
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            Course (hold / fire)
          </p>
          <CoursePicker value={activeCourse} onChange={setActiveCourse} compact />
        </div>
        <ul className="max-h-64 space-y-2 overflow-y-auto p-3 lg:max-h-[50vh]">
          {activeOrder?.items.length ? (
            activeOrder.items
              .filter((line) => !line.parentOrderItemId)
              .map((line) => {
                const children = activeOrder.items.filter((c) => c.parentOrderItemId === line.id);
                return (
                  <li key={line.id} className="rounded-lg bg-slate-50 px-2 py-1.5 text-sm">
                    <div className="flex justify-between font-medium">
                      <span>
                        {line.seatNumber ? (
                          <span className="mr-1.5 rounded bg-orange-100 px-1.5 py-0.5 text-[10px] font-bold text-orange-800">
                            S{line.seatNumber}
                          </span>
                        ) : null}
                        <span className="mr-1 rounded bg-slate-200 px-1 text-[10px] font-bold text-slate-600">
                          {MENU_COURSE_SHORT[line.course as MenuCourseId] ?? line.course}
                        </span>
                        {line.menuItem.name}
                      </span>
                      <span>{formatCurrency(line.price)}</span>
                    </div>
                    {line.modifierSummary && (
                      <p className="text-xs text-slate-500">{line.modifierSummary}</p>
                    )}
                    {children.map((child) => (
                      <p key={child.id} className="ml-2 text-xs text-slate-500">
                        {child.modifierSummary}
                        {child.kitchenStation && (
                          <span className="text-orange-600"> → {child.kitchenStation.name}</span>
                        )}
                      </p>
                    ))}
                    {line.kitchenStation && line.routesToKitchen !== false && (
                      <p className="text-[10px] text-slate-400">→ {line.kitchenStation.name}</p>
                    )}
                    {line.routesToKitchen === false ? (
                      <p className="text-[10px] uppercase text-slate-400">Combo — routes via components</p>
                    ) : (
                      <p
                        className={cn(
                          "text-[10px] uppercase",
                          line.kitchenStatus === "FIRED" ? "text-green-600" : "text-amber-600"
                        )}
                      >
                        {line.kitchenStatus === "FIRED" ? "✓ In kitchen" : "Held"}
                      </p>
                    )}
                  </li>
                );
              })
          ) : (
            <li className="text-sm text-slate-400">Tap an item to start — 3-tap rule enabled</li>
          )}
        </ul>
        {activeOrder && (
          <div className="border-t p-3">
            <p className="text-lg font-bold">{formatCurrency(activeOrder.totalAmount)}</p>
            {activeOrder.items.length > 0 && (
              <div className="mt-2 space-y-0">
                {MENU_COURSES.filter((c) => c !== "OTHER").map((course) => {
                  const count = pendingFireCountByCourse(activeOrder, course);
                  if (!count) return null;
                  return (
                    <Button
                      key={course}
                      size="sm"
                      variant="ghost"
                      className="mt-1 w-full justify-start text-xs"
                      onClick={() => void fireCourse(course)}
                      disabled={actionBusy}
                      type="button"
                    >
                      <Flame className="h-3 w-3" />
                      Fire {MENU_COURSE_SHORT[course]} ({count})
                    </Button>
                  );
                })}
                {SERVE_STEPS.map((step) => {
                  const state = stepStates[step];
                  if (state === "hidden") return null;
                  const Icon = STEP_ICONS[step];
                  const label = serveStepLabel(step, fireCount);
                  const clickable = state === "active" && !actionBusy;
                  const payBlocked = step === "pay" && !canTakePayment;

                  return (
                    <Button
                      key={step}
                      size="sm"
                      variant={state === "active" ? "primary" : "secondary"}
                      className={stepButtonClass(state, step)}
                      onClick={() => void handleStepAction(step)}
                      disabled={!clickable || payBlocked}
                      type="button"
                    >
                      {state === "complete" ? (
                        <Check className="h-4 w-4 shrink-0" />
                      ) : (
                        <Icon className="h-4 w-4 shrink-0" />
                      )}
                      <span className="truncate">{label}</span>
                    </Button>
                  );
                })}
              </div>
            )}
          </div>
        )}
        <div className="border-t p-2 text-center">
          <Link href="/orders?view=checks" className="text-xs text-slate-500 hover:text-orange-600">
            Checks &amp; history →
          </Link>
        </div>
      </aside>

      {/* Menu grid */}
      <div className="flex-1">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            {daypartLabel && (
              <p className="mb-1 text-xs font-medium text-orange-700">{daypartLabel}</p>
            )}
            <div className="flex flex-wrap gap-1">
              {categories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setActiveCategory(cat)}
                  className={cn(
                    "rounded-full px-3 py-1 text-xs font-semibold",
                    activeCategory === cat
                      ? "bg-slate-900 text-white"
                      : "bg-slate-100 text-slate-600"
                  )}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={load}>
              <RefreshCw className="h-4 w-4" />
            </Button>
            {canLayout && (
              <Button
                variant={layoutEdit ? "primary" : "secondary"}
                size="sm"
                onClick={() => setLayoutEdit(!layoutEdit)}
              >
                <GripVertical className="h-4 w-4" />
                {layoutEdit ? "Done layout" : "Edit layout"}
              </Button>
            )}
          </div>
        </div>

        {layoutEdit && (
          <p className="mb-2 flex items-center gap-2 text-xs text-slate-500">
            <LayoutGrid className="h-3 w-3" />
            Drag buttons to reorder. Colors follow category styles (beer = green, cocktails = pink).
          </p>
        )}

        <PosItemGrid
          items={config?.menuItems ?? []}
          categoryStyles={categoryStyleMap}
          activeCategory={activeCategory}
          onSelect={handleItemTap}
          layoutEdit={layoutEdit}
          onReorder={saveLayout}
        />

        <p className="mt-4 text-center text-xs text-slate-400">
          Forced modifiers open step-by-step (cook temp → sides). Category extras apply to all burgers.
          {tapCount > 0 && ` · Last send: ${tapCount} tap${tapCount > 1 ? "s" : ""}`}
        </p>
      </div>

      {fractionalOpen ? (
        <FractionalPieWizard
          open={!!pendingItem}
          itemName={pendingItem?.name ?? ""}
          groups={pendingGroups}
          onClose={() => {
            setPendingItem(null);
            setPendingGroups([]);
            setFractionalOpen(false);
          }}
          onFire={(payload) => {
            handleModifierFire(payload);
            setFractionalOpen(false);
          }}
        />
      ) : (
        <ModifierWizard
          open={!!pendingItem}
          itemName={pendingItem?.name ?? ""}
          groups={pendingGroups}
          onClose={() => {
            setPendingItem(null);
            setPendingGroups([]);
          }}
          onFire={handleModifierFire}
        />
      )}

      <PayCheckScreen
        open={paymentOpen}
        order={paymentOrder}
        onClose={() => {
          setPaymentOpen(false);
          setPaymentOrder(null);
        }}
        onUpdate={(updated) => {
          syncOrder(updated as Order);
          if (updated.checkStatus === "CLOSED" || updated.status === "PAID") {
            setPaymentOpen(false);
            setPaymentOrder(null);
          }
        }}
      />
    </div>
  );
}
