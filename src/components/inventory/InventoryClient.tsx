"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus, Package, ScanLine, ClipboardList, MapPin } from "lucide-react";
import { Button, EmptyState, ScrollableTabs, TabPill } from "@/components/ui";
import { Input, Select, FormField, Modal } from "@/components/ui/form";
import { apiPost, apiPatch, apiDelete } from "@/lib/api";
import { InventoryScanModal } from "@/components/inventory/InventoryScanModal";
import { UnitSelect } from "@/components/inventory/UnitSelect";
import { useLocationLocale } from "@/components/location/LocationLocaleProvider";
import { defaultWeightUnit } from "@/lib/location/measurements";
import { StorageZonesPanel, type StorageZoneRow } from "@/components/inventory/StorageZonesPanel";
import { InventoryItemsByZone } from "@/components/inventory/InventoryItemsByZone";
import { WalkInClient } from "@/components/walk-in/WalkInClient";
import { MonthlyCountClient } from "@/components/inventory/MonthlyCountClient";
import { PageSectionShell, PageSection } from "@/components/layout/PageSections";
import type { InventoryItem } from "@/components/inventory/types";

type Tab = "items" | "count" | "monthly" | "zones";

const TABS: { id: Tab; label: string; icon: typeof Package }[] = [
  { id: "items", label: "Items", icon: Package },
  { id: "count", label: "Zone count", icon: ClipboardList },
  { id: "monthly", label: "Monthly count", icon: ClipboardList },
  { id: "zones", label: "Storage zones", icon: MapPin },
];

function tabFromParam(value: string | null): Tab {
  if (value === "count" || value === "zones" || value === "monthly") return value;
  return "items";
}

export function InventoryClient({
  initialItems,
  initialZones = [],
  initialTab,
}: {
  initialItems: InventoryItem[];
  initialZones?: StorageZoneRow[];
  initialTab?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<Tab>(() => tabFromParam(initialTab ?? searchParams.get("tab")));
  const [items, setItems] = useState(initialItems);
  const [zones, setZones] = useState<StorageZoneRow[]>(initialZones);
  const [modalOpen, setModalOpen] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
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
    barcode: "",
    storageZoneId: "",
  });
  const { settings } = useLocationLocale();
  const defaultUnit = defaultWeightUnit(settings);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setActiveTab = useCallback(
    (next: Tab) => {
      setTab(next);
      const params = new URLSearchParams(searchParams.toString());
      if (next === "items") params.delete("tab");
      else params.set("tab", next);
      const qs = params.toString();
      router.replace(qs ? `/inventory?${qs}` : "/inventory", { scroll: false });
    },
    [router, searchParams]
  );

  useEffect(() => {
    setTab(tabFromParam(searchParams.get("tab")));
  }, [searchParams]);

  useEffect(() => {
    if (initialZones.length > 0) return;
    fetch("/api/inventory/storage-zones")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setZones(data);
      })
      .catch(() => undefined);
  }, [initialZones.length]);

  const openCreate = () => {
    setEditing(null);
    setForm({
      name: "",
      quantity: "",
      unit: defaultUnit,
      minQuantity: "",
      costPerUnit: "",
      portionSize: "",
      yieldPct: "100",
      supplier: "",
      barcode: "",
      storageZoneId: "",
    });
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
      barcode: item.barcode || "",
      storageZoneId: item.storageZoneId || "",
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
        barcode: form.barcode.replace(/\D/g, "") || null,
        storageZoneId: form.storageZoneId || null,
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

  const handleReceived = (item: InventoryItem, created: boolean) => {
    setItems((prev) => {
      if (created) return [...prev, item].sort((a, b) => a.name.localeCompare(b.name));
      return prev.map((i) => (i.id === item.id ? item : i));
    });
  };

  return (
    <>
      <ScrollableTabs className="mb-6 border-b border-slate-200 pb-2" menuLabel="Inventory">
        {TABS.map(({ id, label, icon: Icon }) => (
          <TabPill key={id} active={tab === id} onClick={() => setActiveTab(id)}>
            <Icon className="h-4 w-4 shrink-0" />
            {label}
          </TabPill>
        ))}
      </ScrollableTabs>

      {tab === "count" && <WalkInClient />}

      {tab === "monthly" && <MonthlyCountClient />}

      {tab === "zones" && (
        <PageSectionShell pageId="inventory-zones">
          <PageSection
            id="storage-zones"
            title="Storage zones"
            description="Organize inventory by walk-in and cooler locations"
            defaultOpen
          >
            <StorageZonesPanel onZonesChange={setZones} />
          </PageSection>
        </PageSectionShell>
      )}

      {tab === "items" && (
        <PageSectionShell pageId="inventory-items">
          <PageSection
            id="inv-actions"
            title="Actions"
            description="Receive stock via barcode or add items manually"
            headerActions={
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" size="sm" onClick={() => setScanOpen(true)}>
                  <ScanLine className="h-4 w-4" />
                  Scan &amp; receive
                </Button>
                <Button size="sm" onClick={openCreate}>
                  <Plus className="h-4 w-4" />
                  Add Item
                </Button>
              </div>
            }
          >
            <span className="sr-only">Inventory actions</span>
          </PageSection>

          <PageSection id="inv-items" title="Inventory by zone" defaultOpen>
            {items.length === 0 ? (
              <EmptyState
                icon={<Package className="h-12 w-12" />}
                title="No inventory items"
                description="Scan a barcode to receive stock, or add items manually."
                action={
                  <div className="flex flex-wrap justify-center gap-2">
                    <Button onClick={() => setScanOpen(true)}>
                      <ScanLine className="h-4 w-4" />
                      Scan &amp; receive
                    </Button>
                    <Button variant="secondary" onClick={openCreate}>
                      Add manually
                    </Button>
                  </div>
                }
              />
            ) : (
              <InventoryItemsByZone
                items={items}
                zones={zones}
                onEdit={openEdit}
                onDelete={handleDelete}
              />
            )}
          </PageSection>
        </PageSectionShell>
      )}

      <InventoryScanModal
        open={scanOpen}
        onClose={() => setScanOpen(false)}
        onReceived={handleReceived}
      />

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? "Edit Item" : "Add Item"}>
        <div className="space-y-4">
          <FormField label="Name">
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </FormField>
          <FormField label="Storage zone">
            <Select
              value={form.storageZoneId}
              onChange={(e) => setForm({ ...form, storageZoneId: e.target.value })}
            >
              <option value="">Unassigned</option>
              {zones.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.name}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Barcode (optional)">
            <Input
              value={form.barcode}
              onChange={(e) => setForm({ ...form, barcode: e.target.value.replace(/\D/g, "") })}
              placeholder="UPC / EAN"
            />
          </FormField>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Quantity">
              <Input type="number" step="0.01" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
            </FormField>
            <FormField label="Unit">
              <UnitSelect value={form.unit} onChange={(unit) => setForm({ ...form, unit })} />
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
