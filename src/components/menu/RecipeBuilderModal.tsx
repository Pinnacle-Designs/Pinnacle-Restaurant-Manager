"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Layers, Plus, Trash2, UtensilsCrossed } from "lucide-react";
import { Button } from "@/components/ui";
import {
  CollapsibleGroup,
  CollapsibleGroupControls,
  CollapsibleSection,
} from "@/components/ui/Collapsible";
import { Input, Select, FormField, Modal } from "@/components/ui/form";
import { apiFetch } from "@/lib/api";
import { lineTheoreticalCost } from "@/lib/menu/recipe-cost";
import { formatCurrency } from "@/lib/utils";

interface InventoryOption {
  id: string;
  name: string;
  unit: string;
  costPerUnit: number;
  yieldPct?: number;
}

interface MenuItemOption {
  id: string;
  name: string;
  category: string;
  recipeCost: number;
}

interface RecipeLineRow {
  inventoryItemId: string;
  quantity: string;
}

interface RecipeComponentRow {
  componentMenuItemId: string;
  quantity: string;
}

interface FlattenedPreviewLine {
  inventoryItemId: string;
  name: string;
  unit: string;
  quantity: number;
  lineCost: number;
}

interface RecipeBuilderModalProps {
  open: boolean;
  menuItem: { id: string; name: string; price: number } | null;
  inventory: InventoryOption[];
  menuItems: MenuItemOption[];
  onClose: () => void;
  onSaved: (recipeCost: number) => void;
}

type RecipePayload = {
  lines: Array<{ inventoryItemId: string; quantity: number }>;
  components: Array<{ componentMenuItemId: string; quantity: number }>;
  flattenedLines: Array<{
    inventoryItemId: string;
    quantity: number;
    lineCost: number;
    inventoryItem: { id: string; name: string; unit: string; costPerUnit: number; yieldPct: number };
  }>;
  theoreticalCost: number;
};

export function RecipeBuilderModal({
  open,
  menuItem,
  inventory,
  menuItems,
  onClose,
  onSaved,
}: RecipeBuilderModalProps) {
  const [lines, setLines] = useState<RecipeLineRow[]>([{ inventoryItemId: "", quantity: "" }]);
  const [components, setComponents] = useState<RecipeComponentRow[]>([]);
  const [componentCache, setComponentCache] = useState<
    Map<string, RecipePayload["flattenedLines"]>
  >(new Map());
  const [theoreticalCost, setTheoreticalCost] = useState(0);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const componentOptions = useMemo(
    () => menuItems.filter((item) => item.id !== menuItem?.id),
    [menuItems, menuItem?.id]
  );

  const loadComponentRecipe = useCallback(async (componentMenuItemId: string) => {
    if (!componentMenuItemId) return;
    try {
      const data = await apiFetch<RecipePayload>(`/api/menu/${componentMenuItemId}/recipe`);
      setComponentCache((prev) => {
        if (prev.has(componentMenuItemId)) return prev;
        const next = new Map(prev);
        next.set(componentMenuItemId, data.flattenedLines);
        return next;
      });
    } catch {
      /* preview only */
    }
  }, []);

  useEffect(() => {
    if (!open || !menuItem) return;
    setLoading(true);
    setError(null);
    setComponentCache(new Map());
    apiFetch<RecipePayload>(`/api/menu/${menuItem.id}/recipe`)
      .then((data) => {
        setTheoreticalCost(data.theoreticalCost);
        setLines(
          data.lines.length
            ? data.lines.map((l) => ({
                inventoryItemId: l.inventoryItemId,
                quantity: String(l.quantity),
              }))
            : [{ inventoryItemId: "", quantity: "" }]
        );
        setComponents(
          data.components.length
            ? data.components.map((c) => ({
                componentMenuItemId: c.componentMenuItemId,
                quantity: String(c.quantity),
              }))
            : []
        );
        for (const comp of data.components) {
          void apiFetch<RecipePayload>(`/api/menu/${comp.componentMenuItemId}/recipe`).then(
            (sub) => {
              setComponentCache((prev) => {
                const next = new Map(prev);
                next.set(comp.componentMenuItemId, sub.flattenedLines);
                return next;
              });
            }
          );
        }
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load recipe"))
      .finally(() => setLoading(false));
  }, [open, menuItem?.id]);

  const flattenedPreview = useMemo(() => {
    const rollup = new Map<string, FlattenedPreviewLine>();

    const merge = (
      inventoryItemId: string,
      name: string,
      unit: string,
      quantity: number,
      costPerUnit: number,
      yieldPct: number
    ) => {
      const existing = rollup.get(inventoryItemId);
      const nextQty = (existing?.quantity ?? 0) + quantity;
      rollup.set(inventoryItemId, {
        inventoryItemId,
        name,
        unit,
        quantity: Math.round(nextQty * 1000) / 1000,
        lineCost: lineTheoreticalCost(nextQty, costPerUnit, yieldPct),
      });
    };

    for (const line of lines) {
      const qty = parseFloat(line.quantity);
      if (!line.inventoryItemId || !(qty > 0)) continue;
      const inv = inventory.find((i) => i.id === line.inventoryItemId);
      if (!inv) continue;
      merge(
        inv.id,
        inv.name,
        inv.unit,
        qty,
        inv.costPerUnit,
        inv.yieldPct ?? 100
      );
    }

    for (const comp of components) {
      const qty = parseFloat(comp.quantity);
      if (!comp.componentMenuItemId || !(qty > 0)) continue;
      const nested = componentCache.get(comp.componentMenuItemId) ?? [];
      for (const line of nested) {
        merge(
          line.inventoryItemId,
          line.inventoryItem.name,
          line.inventoryItem.unit,
          line.quantity * qty,
          line.inventoryItem.costPerUnit,
          line.inventoryItem.yieldPct
        );
      }
    }

    return Array.from(rollup.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [lines, components, inventory, componentCache]);

  useEffect(() => {
    const total = flattenedPreview.reduce((sum, line) => sum + line.lineCost, 0);
    setTheoreticalCost(Math.round(total * 100) / 100);
  }, [flattenedPreview]);

  if (!open || !menuItem) return null;

  const margin = menuItem.price - theoreticalCost;
  const marginPct = menuItem.price > 0 ? (margin / menuItem.price) * 100 : 0;

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const payload = {
        lines: lines
          .filter((l) => l.inventoryItemId && parseFloat(l.quantity) > 0)
          .map((l) => ({
            inventoryItemId: l.inventoryItemId,
            quantity: parseFloat(l.quantity),
          })),
        components: components
          .filter((c) => c.componentMenuItemId && parseFloat(c.quantity) > 0)
          .map((c) => ({
            componentMenuItemId: c.componentMenuItemId,
            quantity: parseFloat(c.quantity),
          })),
      };
      const data = await apiFetch<{ menuItem: { recipeCost: number } }>(
        `/api/menu/${menuItem.id}/recipe`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      onSaved(data.menuItem.recipeCost);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save recipe");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={`Recipe — ${menuItem.name}`}>
      <CollapsibleGroup defaultExpanded="all" expandKey={menuItem.id}>
        <CollapsibleGroupControls className="mb-3" />
        <div className="space-y-3">
          <CollapsibleSection
            id="recipe-ingredients"
            title="Direct ingredients"
            description="Raw inventory used directly on this plate."
            defaultOpen
            variant="plain"
            bodyClassName="!pt-2"
          >
            {loading ? (
              <p className="text-sm text-slate-500">Loading recipe…</p>
            ) : (
              <div className="space-y-3">
                {lines.map((line, idx) => (
                  <div key={idx} className="flex items-end gap-2">
                    <FormField label={idx === 0 ? "Ingredient" : " "} className="flex-1">
                      <Select
                        value={line.inventoryItemId}
                        onChange={(e) => {
                          const next = [...lines];
                          next[idx] = { ...next[idx], inventoryItemId: e.target.value };
                          setLines(next);
                        }}
                      >
                        <option value="">Select inventory item…</option>
                        {inventory.map((inv) => (
                          <option key={inv.id} value={inv.id}>
                            {inv.name} ({inv.unit} @ {formatCurrency(inv.costPerUnit)})
                          </option>
                        ))}
                      </Select>
                    </FormField>
                    <FormField label={idx === 0 ? "Qty / plate" : " "} className="w-28">
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={line.quantity}
                        onChange={(e) => {
                          const next = [...lines];
                          next[idx] = { ...next[idx], quantity: e.target.value };
                          setLines(next);
                        }}
                        placeholder="0"
                      />
                    </FormField>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setLines(lines.filter((_, i) => i !== idx))}
                      disabled={lines.length === 1 && !components.length}
                    >
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setLines([...lines, { inventoryItemId: "", quantity: "" }])}
                >
                  <Plus className="h-4 w-4" />
                  Add ingredient
                </Button>
              </div>
            )}
          </CollapsibleSection>

          <CollapsibleSection
            id="recipe-sub-recipes"
            title="Sub-recipes"
            description="Include another menu item's full recipe — all of its ingredients roll up for costing and inventory depletion."
            defaultOpen
            variant="plain"
            bodyClassName="!pt-2"
          >
            {loading ? (
              <p className="text-sm text-slate-500">Loading…</p>
            ) : (
              <div className="space-y-3">
                {components.length === 0 && (
                  <p className="text-sm text-slate-500">
                    No sub-recipes yet. Add a sauce, prep batch, or base that already has its own recipe.
                  </p>
                )}
                {components.map((comp, idx) => (
                  <div key={idx} className="flex items-end gap-2">
                    <FormField label={idx === 0 ? "Menu item" : " "} className="flex-1">
                      <Select
                        value={comp.componentMenuItemId}
                        onChange={(e) => {
                          const next = [...components];
                          next[idx] = { ...next[idx], componentMenuItemId: e.target.value };
                          setComponents(next);
                          void loadComponentRecipe(e.target.value);
                        }}
                      >
                        <option value="">Select existing recipe…</option>
                        {componentOptions.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name} ({item.category})
                            {item.recipeCost > 0 ? ` — ${formatCurrency(item.recipeCost)}/plate` : ""}
                          </option>
                        ))}
                      </Select>
                    </FormField>
                    <FormField label={idx === 0 ? "Portions" : " "} className="w-28">
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={comp.quantity}
                        onChange={(e) => {
                          const next = [...components];
                          next[idx] = { ...next[idx], quantity: e.target.value };
                          setComponents(next);
                        }}
                        placeholder="1"
                      />
                    </FormField>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setComponents(components.filter((_, i) => i !== idx))}
                    >
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() =>
                    setComponents([...components, { componentMenuItemId: "", quantity: "1" }])
                  }
                >
                  <Layers className="h-4 w-4" />
                  Add sub-recipe
                </Button>
              </div>
            )}
          </CollapsibleSection>

          {flattenedPreview.length > 0 && (
            <CollapsibleSection
              id="recipe-rollup"
              title="All ingredients (rolled up)"
              description="Combined inventory impact per plate — direct items plus everything from sub-recipes."
              defaultOpen
              variant="plain"
              bodyClassName="!pt-2"
            >
              <ul className="divide-y rounded-lg border border-slate-200 text-sm">
                {flattenedPreview.map((line) => (
                  <li
                    key={line.inventoryItemId}
                    className="flex items-center justify-between gap-3 px-3 py-2"
                  >
                    <span className="min-w-0 truncate text-slate-700">
                      {line.name}{" "}
                      <span className="text-slate-400">
                        {line.quantity} {line.unit}
                      </span>
                    </span>
                    <span className="shrink-0 font-medium text-slate-600">
                      {formatCurrency(line.lineCost)}
                    </span>
                  </li>
                ))}
              </ul>
            </CollapsibleSection>
          )}

          <CollapsibleSection
            id="recipe-costing"
            title="Cost & margin"
            defaultOpen
            variant="plain"
            bodyClassName="!pt-2"
          >
            <div className="rounded-lg bg-slate-50 p-3 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-600">Menu price</span>
                <span className="font-semibold">{formatCurrency(menuItem.price)}</span>
              </div>
              <div className="mt-1 flex justify-between">
                <span className="text-slate-600">Theoretical food cost</span>
                <span className="font-semibold text-orange-600">{formatCurrency(theoreticalCost)}</span>
              </div>
              <div className="mt-1 flex justify-between">
                <span className="text-slate-600">Margin</span>
                <span className="font-semibold">
                  {formatCurrency(margin)} ({marginPct.toFixed(1)}%)
                </span>
              </div>
            </div>
          </CollapsibleSection>
        </div>
      </CollapsibleGroup>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={handleSave} disabled={saving || loading}>
          <UtensilsCrossed className="h-4 w-4" />
          {saving ? "Saving…" : "Save recipe"}
        </Button>
      </div>
    </Modal>
  );
}
