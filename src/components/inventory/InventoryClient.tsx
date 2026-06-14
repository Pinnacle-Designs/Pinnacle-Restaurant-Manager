"use client";

import { useState } from "react";
import { Pencil, Plus, Trash2, Package } from "lucide-react";
import { Button, Badge, EmptyState } from "@/components/ui";
import { Input, Select, FormField, Modal } from "@/components/ui/form";
import { apiPost, apiPatch, apiDelete } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";

interface InventoryItem {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  minQuantity: number;
  costPerUnit: number;
  portionSize: number | null;
  yieldPct: number;
  supplier: string | null;
}

export function InventoryClient({ initialItems }: { initialItems: InventoryItem[] }) {
  const [items, setItems] = useState(initialItems);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<InventoryItem | null>(null);
  const [form, setForm] = useState({
    name: "",
    quantity: "",
    unit: "lbs",
    minQuantity: "",
    costPerUnit: "",
    portionSize: "",
    yieldPct: "100",
    supplier: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openCreate = () => {
    setEditing(null);
    setForm({ name: "", quantity: "", unit: "lbs", minQuantity: "", costPerUnit: "", portionSize: "", yieldPct: "100", supplier: "" });
    setError(null);
    setModalOpen(true);
  };

  const openEdit = (item: InventoryItem) => {
    setEditing(item);
    setForm({
      name: item.name,
      quantity: String(item.quantity),
      unit: item.unit,
      minQuantity: String(item.minQuantity),
      costPerUnit: String(item.costPerUnit),
      portionSize: item.portionSize != null ? String(item.portionSize) : "",
      yieldPct: String(item.yieldPct ?? 100),
      supplier: item.supplier || "",
    });
    setError(null);
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.name || !form.quantity) {
      setError("Name and quantity are required");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        quantity: parseFloat(form.quantity),
        unit: form.unit,
        minQuantity: parseFloat(form.minQuantity) || 0,
        costPerUnit: parseFloat(form.costPerUnit) || 0,
        portionSize: form.portionSize ? parseFloat(form.portionSize) : null,
        yieldPct: parseFloat(form.yieldPct) || 100,
        supplier: form.supplier || null,
      };
      if (editing) {
        const updated = await apiPatch<InventoryItem>(`/api/inventory/${editing.id}`, payload);
        setItems((prev) => prev.map((i) => (i.id === editing.id ? updated : i)));
      } else {
        const created = await apiPost<InventoryItem>("/api/inventory", payload);
        setItems((prev) => [...prev, created]);
      }
      setModalOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this inventory item?")) return;
    await apiDelete(`/api/inventory/${id}`);
    setItems((prev) => prev.filter((i) => i.id !== id));
  };

  return (
    <>
      <div className="mb-6 flex justify-end">
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" />
          Add Item
        </Button>
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={<Package className="h-12 w-12" />}
          title="No inventory items"
          description="Track stock levels and get low-stock alerts."
          action={<Button onClick={openCreate}>Add Item</Button>}
        />
      ) : (
        <div className="overflow-hidden rounded-xl border bg-white">
          <table className="w-full text-sm">
            <thead className="border-b bg-slate-50">
              <tr>
                <th className="px-6 py-3 text-left font-medium text-slate-500">Item</th>
                <th className="px-6 py-3 text-left font-medium text-slate-500">Quantity</th>
                <th className="px-6 py-3 text-left font-medium text-slate-500">Min</th>
                <th className="px-6 py-3 text-left font-medium text-slate-500">Cost/Unit</th>
                <th className="px-6 py-3 text-left font-medium text-slate-500">Yield %</th>
                <th className="px-6 py-3 text-left font-medium text-slate-500">Supplier</th>
                <th className="px-6 py-3 text-left font-medium text-slate-500">Status</th>
                <th className="px-6 py-3 text-right font-medium text-slate-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {items.map((item) => {
                const isLow = item.quantity <= item.minQuantity;
                return (
                  <tr key={item.id} className={isLow ? "bg-amber-50" : ""}>
                    <td className="px-6 py-4 font-medium text-slate-900">{item.name}</td>
                    <td className="px-6 py-4 text-slate-600">{item.quantity} {item.unit}</td>
                    <td className="px-6 py-4 text-slate-600">{item.minQuantity} {item.unit}</td>
                    <td className="px-6 py-4 text-slate-600">{formatCurrency(item.costPerUnit)}</td>
                    <td className="px-6 py-4 text-slate-600">{(item.yieldPct ?? 100).toFixed(0)}%</td>
                    <td className="px-6 py-4 text-slate-600">{item.supplier || "—"}</td>
                    <td className="px-6 py-4">
                      <Badge className={isLow ? "bg-amber-100 text-amber-800" : "bg-green-100 text-green-700"}>
                        {isLow ? "Low Stock" : "OK"}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => openEdit(item)}>
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => handleDelete(item.id)}>
                          <Trash2 className="h-3 w-3 text-red-500" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? "Edit Item" : "Add Item"}>
        <div className="space-y-4">
          <FormField label="Name">
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </FormField>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Quantity">
              <Input type="number" step="0.01" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
            </FormField>
            <FormField label="Unit">
              <Select value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })}>
                <option value="lbs">lbs</option>
                <option value="oz">oz</option>
                <option value="units">units</option>
                <option value="heads">heads</option>
                <option value="bottles">bottles</option>
                <option value="cases">cases</option>
              </Select>
            </FormField>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Min Quantity">
              <Input type="number" step="0.01" value={form.minQuantity} onChange={(e) => setForm({ ...form, minQuantity: e.target.value })} />
            </FormField>
            <FormField label="Cost per Unit">
              <Input type="number" step="0.01" value={form.costPerUnit} onChange={(e) => setForm({ ...form, costPerUnit: e.target.value })} />
            </FormField>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Portion Size">
              <Input type="number" step="0.01" value={form.portionSize} onChange={(e) => setForm({ ...form, portionSize: e.target.value })} placeholder="e.g. 0.5" />
            </FormField>
            <FormField label="Yield %">
              <Input type="number" step="1" min="1" max="100" value={form.yieldPct} onChange={(e) => setForm({ ...form, yieldPct: e.target.value })} />
            </FormField>
          </div>
          <FormField label="Supplier">
            <Input value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} />
          </FormField>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
