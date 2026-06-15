"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui";
import { Input, Select, Textarea, FormField, Modal } from "@/components/ui/form";
import { cn, formatCurrency } from "@/lib/utils";
import { PosItemGrid, type PosMenuItem } from "@/components/pos/PosItemGrid";
import { ModifierWizard } from "@/components/pos/ModifierWizard";
import { SeatPicker } from "@/components/orders/SeatPicker";
import {
  resolveModifierGroupsForItem,
  shouldOpenModifierWizard,
  type ModifierGroupConfig,
} from "@/lib/pos/modifiers";

export interface OrderMenuItem extends PosMenuItem {
  available: boolean;
}

interface Table {
  id: string;
  number: number;
  capacity: number;
}

type ModifierGroupRow = ModifierGroupConfig & {
  categories: string | null;
  menuItemId: string | null;
};

export interface OrderMenuSubmitPayload {
  menuItemId: string;
  quantity: number;
  price: number;
  modifiers?: unknown[];
  modifierSummary?: string;
  tableId?: string | null;
  guestCount?: number;
  channel?: string;
  notes?: string | null;
  seatNumber?: number;
}

interface OrderMenuSheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  mode: "create" | "add";
  menuItems: OrderMenuItem[];
  tables?: Table[];
  /** Table for add-to-check — drives seat buttons from capacity */
  orderTable?: Table | null;
  submitLabel: string;
  saving?: boolean;
  error?: string | null;
  onSubmit: (payload: OrderMenuSubmitPayload) => void;
}

const CHANNELS = ["dine-in", "pickup", "delivery", "catering"] as const;

export function OrderMenuSheet({
  open,
  onClose,
  title,
  mode,
  menuItems,
  tables = [],
  orderTable = null,
  submitLabel,
  saving,
  error,
  onSubmit,
}: OrderMenuSheetProps) {
  const [categoryStyles, setCategoryStyles] = useState<
    Record<string, { color: string; icon?: string | null }>
  >({});
  const [modifierGroups, setModifierGroups] = useState<ModifierGroupRow[]>([]);
  const [activeCategory, setActiveCategory] = useState("All");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [tableId, setTableId] = useState("");
  const [guestCount, setGuestCount] = useState("2");
  const [channel, setChannel] = useState<string>("dine-in");
  const [notes, setNotes] = useState("");
  const [seatNumber, setSeatNumber] = useState<number | null>(1);
  const [pendingItem, setPendingItem] = useState<OrderMenuItem | null>(null);
  const [pendingGroups, setPendingGroups] = useState<ModifierGroupConfig[]>([]);
  const [modifierExtras, setModifierExtras] = useState<{
    modifiers: unknown[];
    modifierSummary: string;
    priceDelta: number;
  } | null>(null);

  const loadPosStyles = useCallback(async () => {
    try {
      const res = await fetch("/api/pos/config");
      if (!res.ok) return;
      const data = await res.json();
      const map: Record<string, { color: string; icon?: string | null }> = {};
      (data.categoryStyles ?? []).forEach(
        (s: { category: string; color: string; icon: string | null }) => {
          map[s.category] = { color: s.color, icon: s.icon };
        }
      );
      setCategoryStyles(map);
      setModifierGroups(data.modifierGroups ?? []);
    } catch {
      /* optional — grid still works with default colors */
    }
  }, []);

  useEffect(() => {
    if (open) {
      loadPosStyles();
      setSelectedId(null);
      setQuantity(1);
      setModifierExtras(null);
      setPendingItem(null);
      setActiveCategory("All");
      setSeatNumber(1);
    }
  }, [open, loadPosStyles]);

  const selectedTable =
    mode === "create"
      ? tables.find((t) => t.id === tableId) ?? null
      : orderTable;

  useEffect(() => {
    if (selectedTable) {
      setSeatNumber((prev) =>
        prev && prev <= selectedTable.capacity ? prev : 1
      );
    } else if (mode === "create") {
      setSeatNumber(null);
    }
  }, [selectedTable?.id, selectedTable?.capacity, mode]);

  const available = useMemo(
    () =>
      menuItems
        .filter((m) => m.available)
        .sort((a, b) => (a.posGridIndex ?? 999) - (b.posGridIndex ?? 999)),
    [menuItems]
  );

  const categories = useMemo(() => {
    const cats = new Set(available.map((m) => m.category));
    return ["All", ...Array.from(cats).sort()];
  }, [available]);

  const selectedItem = available.find((m) => m.id === selectedId) ?? null;

  const linePrice =
    (selectedItem?.price ?? 0) + (modifierExtras?.priceDelta ?? 0);

  const handleItemTap = (item: OrderMenuItem) => {
    const groups = resolveModifierGroupsForItem(item, modifierGroups);
    if (shouldOpenModifierWizard(groups)) {
      setPendingItem(item);
      setPendingGroups(groups);
      setSelectedId(item.id);
      setModifierExtras(null);
      return;
    }
    setSelectedId(item.id);
    setModifierExtras(null);
  };

  const handleModifierFire = (payload: {
    modifiers: unknown[];
    modifierSummary: string;
    price: number;
  }) => {
    if (pendingItem) {
      setSelectedId(pendingItem.id);
      setModifierExtras({
        modifiers: payload.modifiers,
        modifierSummary: payload.modifierSummary,
        priceDelta: payload.price,
      });
    }
    setPendingItem(null);
    setPendingGroups([]);
  };

  const handleSubmit = () => {
    if (!selectedItem) return;
    if (selectedTable && !seatNumber) return;
    onSubmit({
      menuItemId: selectedItem.id,
      quantity,
      price: linePrice,
      modifiers: modifierExtras?.modifiers,
      modifierSummary: modifierExtras?.modifierSummary,
      seatNumber: seatNumber ?? undefined,
      ...(mode === "create"
        ? {
            tableId: tableId || null,
            guestCount: parseInt(guestCount, 10) || 1,
            channel,
            notes: notes || null,
          }
        : {}),
    });
  };

  return (
    <>
      <Modal open={open} onClose={onClose} title={title} size="fullscreen">
        <div className="flex min-h-0 flex-1 flex-col gap-3">
          {mode === "create" && (
            <div className="grid shrink-0 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <FormField label="Table">
                <div className="flex flex-wrap gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      setTableId("");
                      setSeatNumber(null);
                    }}
                    className={cn(
                      "rounded-lg px-3 py-1.5 text-sm font-medium",
                      !tableId ? "bg-orange-500 text-white" : "bg-slate-100 text-slate-600"
                    )}
                  >
                    Walk-in
                  </button>
                  {tables.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => {
                        setTableId(t.id);
                        setSeatNumber(1);
                      }}
                      className={cn(
                        "rounded-lg px-3 py-1.5 text-sm font-medium",
                        tableId === t.id
                          ? "bg-orange-500 text-white"
                          : "bg-slate-100 text-slate-600"
                      )}
                    >
                      T{t.number}
                    </button>
                  ))}
                </div>
              </FormField>
              <FormField label="Guests">
                <Input
                  type="number"
                  min={1}
                  value={guestCount}
                  onChange={(e) => setGuestCount(e.target.value)}
                />
              </FormField>
              <FormField label="Channel">
                <Select value={channel} onChange={(e) => setChannel(e.target.value)}>
                  {CHANNELS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </Select>
              </FormField>
              <FormField label="Notes">
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={1}
                  placeholder="Optional"
                />
              </FormField>
            </div>
          )}

          {selectedTable && (
            <FormField
              label={
                mode === "add"
                  ? `Seat — Table ${selectedTable.number}`
                  : `Seat — Table ${selectedTable.number} (${selectedTable.capacity} seats)`
              }
            >
              <SeatPicker
                capacity={selectedTable.capacity}
                value={seatNumber}
                onChange={setSeatNumber}
              />
            </FormField>
          )}

          {mode === "add" && !selectedTable && (
            <p className="shrink-0 text-xs text-slate-500">
              Link this check to a table to assign items by seat for split pay.
            </p>
          )}

          <div className="flex shrink-0 flex-wrap gap-1">
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

          <p className="shrink-0 text-xs text-slate-500">
            Tap a color-coded button to select. Items with required modifiers open a quick picker.
          </p>

          <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border bg-slate-50 p-3">
            <PosItemGrid
              items={available}
              categoryStyles={categoryStyles}
              activeCategory={activeCategory}
              onSelect={(item) => handleItemTap(item as OrderMenuItem)}
              selectedId={selectedId}
            />
          </div>

          <div className="shrink-0 rounded-xl border bg-white p-3 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                {selectedItem ? (
                  <>
                    <p className="font-semibold text-slate-900">{selectedItem.name}</p>
                    {modifierExtras?.modifierSummary && (
                      <p className="text-xs text-slate-500">{modifierExtras.modifierSummary}</p>
                    )}
                    <p className="text-sm text-orange-600">
                      {formatCurrency(linePrice)}
                      {quantity > 1 ? ` × ${quantity}` : ""}
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-slate-400">Select a menu item above</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-slate-500">Qty</span>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  disabled={quantity <= 1}
                >
                  <Minus className="h-3 w-3" />
                </Button>
                <span className="w-8 text-center font-semibold">{quantity}</span>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setQuantity((q) => q + 1)}
                >
                  <Plus className="h-3 w-3" />
                </Button>
              </div>
            </div>
            {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
            <div className="mt-3 flex justify-end gap-2">
              <Button variant="secondary" onClick={onClose}>
                Cancel
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={!selectedItem || saving || !!(selectedTable && !seatNumber)}
              >
                {saving ? "Saving…" : submitLabel}
              </Button>
            </div>
          </div>
        </div>
      </Modal>

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
    </>
  );
}
