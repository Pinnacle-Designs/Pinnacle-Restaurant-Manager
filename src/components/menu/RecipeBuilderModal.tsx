"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2, UtensilsCrossed } from "lucide-react";
import { Button } from "@/components/ui";
import { Input, Select, FormField, Modal } from "@/components/ui/form";
import { apiFetch } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";

interface InventoryOption {
  id: string;
  name: string;
  unit: string;
  costPerUnit: number;
}

interface RecipeLineRow {
  inventoryItemId: string;
  quantity: string;
}

interface RecipeBuilderModalProps {
  open: boolean;
  menuItem: { id: string; name: string; price: number } | null;
  inventory: InventoryOption[];
  onClose: () => void;
  onSaved: (recipeCost: number) => void;
}

export function RecipeBuilderModal({
  open,
  menuItem,
  inventory,
  onClose,
  onSaved,
}: RecipeBuilderModalProps) {
  const [lines, setLines] = useState<RecipeLineRow[]>([{ inventoryItemId: "", quantity: "" }]);
  const [theoreticalCost, setTheoreticalCost] = useState(0);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !menuItem) return;
    setLoading(true);
    setError(null);
    apiFetch<{
      lines: Array<{ inventoryItemId: string; quantity: number }>;
      theoreticalCost: number;
    }>(`/api/menu/${menuItem.id}/recipe`)
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
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load recipe"))
      .finally(() => setLoading(false));
  }, [open, menuItem]);

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
      <div className="space-y-4">
        <p className="text-sm text-slate-600">
          Build the exact ingredient list. When this item is fired to the kitchen, inventory deducts
          these amounts automatically.
        </p>

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
                  disabled={lines.length === 1}
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

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || loading}>
            <UtensilsCrossed className="h-4 w-4" />
            {saving ? "Saving…" : "Save recipe"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
