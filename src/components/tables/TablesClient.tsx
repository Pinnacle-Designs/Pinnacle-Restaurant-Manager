"use client";

import { useCallback, useState, useMemo } from "react";
import {
  Plus,
  Pencil,
  Trash2,
  LayoutGrid,
  Map,
  Calendar,
  Save,
  List,
} from "lucide-react";
import { Button, Badge, EmptyState, ScrollableTabs, TabPill } from "@/components/ui";
import { Input, Select, FormField, Modal } from "@/components/ui/form";
import { apiPost, apiPatch, apiDelete } from "@/lib/api";
import { cn } from "@/lib/utils";
import { FloorPlanCanvas, type FloorPlanTable } from "./FloorPlanCanvas";
import { ReservationsPanel } from "./ReservationsPanel";
import type { FloorPlanSection } from "@/lib/tables/floor-plan-constants";
import { DEFAULT_FLOOR_PLAN_SECTIONS } from "@/lib/tables/floor-plan-constants";
import {
  fitFloorPlanToTables,
  layoutNewTable,
  toTableBounds,
} from "@/lib/tables/floor-plan-layout";
import { filterBySearchQuery } from "@/lib/search/text-match";
import { usePageSearch } from "@/hooks/usePageSearch";
import { PageSectionShell, PageSection } from "@/components/layout/PageSections";

interface TableOrder {
  id: string;
  status: string;
}

interface Table extends FloorPlanTable {
  orders: TableOrder[];
}

type TabId = "floor" | "list" | "reservations";

const STATUS_COLORS = {
  available: "bg-green-100 border-green-300 text-green-800",
  occupied: "bg-orange-100 border-orange-300 text-orange-800",
  reserved: "bg-blue-100 border-blue-300 text-blue-800",
};

const SHAPES = [
  { value: "round", label: "Round" },
  { value: "square", label: "Square" },
  { value: "rectangle", label: "Rectangle" },
  { value: "bar", label: "Bar seat" },
];

export function TablesClient({
  initialTables,
  initialFloorPlan,
}: {
  initialTables: Table[];
  initialFloorPlan: {
    width: number;
    height: number;
    sections: FloorPlanSection[];
  };
}) {
  const [tab, setTab] = useState<TabId>("floor");
  const { query } = usePageSearch();
  const [tables, setTables] = useState<Table[]>(initialTables);
  const [planWidth, setPlanWidth] = useState(initialFloorPlan.width);
  const [planHeight, setPlanHeight] = useState(initialFloorPlan.height);
  const [sections, setSections] = useState<FloorPlanSection[]>(
    initialFloorPlan.sections.length ? initialFloorPlan.sections : DEFAULT_FLOOR_PLAN_SECTIONS
  );
  const [editMode, setEditMode] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [layoutDirty, setLayoutDirty] = useState(false);
  const [savingLayout, setSavingLayout] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Table | null>(null);
  const [form, setForm] = useState({
    number: "",
    label: "",
    capacity: "4",
    status: "available",
    section: "main",
    shape: "round",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const visibleTables = useMemo(
    () =>
      filterBySearchQuery(tables, query, (table) => [
        table.label,
        String(table.number),
        table.section,
        table.status,
      ]),
    [tables, query]
  );

  const reloadFloorPlan = useCallback(async () => {
    const res = await fetch("/api/tables/floor-plan");
    const json = await res.json();
    if (res.ok) {
      setTables(json.tables);
      setPlanWidth(json.width);
      setPlanHeight(json.height);
      setSections(json.sections);
      setLayoutDirty(false);
    }
  }, []);

  const openCreate = () => {
    setEditing(null);
    setForm({
      number: "",
      label: "",
      capacity: "4",
      status: "available",
      section: "main",
      shape: "round",
    });
    setError(null);
    setModalOpen(true);
  };

  const openEdit = (table: Table) => {
    setEditing(table);
    setForm({
      number: String(table.number),
      label: table.label ?? "",
      capacity: String(table.capacity),
      status: table.status,
      section: table.section,
      shape: table.shape,
    });
    setError(null);
    setModalOpen(true);
  };

  const persistLayout = async (
    nextSections: FloorPlanSection[],
    nextTables: Table[],
    width: number,
    height: number
  ) => {
    await fetch("/api/tables/floor-plan", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        width,
        height,
        sections: nextSections,
        tables: nextTables.map((t) => ({
          id: t.id,
          posX: t.posX,
          posY: t.posY,
          width: t.width,
          height: t.height,
          rotation: t.rotation,
          shape: t.shape,
          section: t.section,
          label: t.label,
        })),
      }),
    });
  };

  const applyFittedLayout = (
    prevTables: Table[],
    fitted: ReturnType<typeof fitFloorPlanToTables>
  ): Table[] =>
    prevTables.map((t, i) => ({
      ...t,
      posX: fitted.tables[i]?.posX ?? t.posX,
      posY: fitted.tables[i]?.posY ?? t.posY,
      width: fitted.tables[i]?.width ?? t.width,
      height: fitted.tables[i]?.height ?? t.height,
    }));

  const handleSave = async () => {
    if (!form.number) {
      setError("Table number is required");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        number: parseInt(form.number),
        label: form.label || null,
        capacity: parseInt(form.capacity) || 4,
        status: form.status,
        section: form.section,
        shape: form.shape,
      };
      if (editing) {
        const updated = await apiPatch<Table>(`/api/tables/${editing.id}`, payload);
        setTables((prev) => {
          const merged = prev.map((t) =>
            t.id === editing.id ? { ...t, ...updated, orders: editing.orders } : t
          );
          const fitted = fitFloorPlanToTables(
            sections,
            toTableBounds(merged),
            planWidth,
            planHeight
          );
          setSections(fitted.sections);
          setPlanWidth(fitted.width);
          setPlanHeight(fitted.height);
          return applyFittedLayout(merged, fitted);
        });
        setLayoutDirty(true);
      } else {
        const layout = layoutNewTable(
          sections,
          toTableBounds(tables),
          planWidth,
          planHeight,
          form.section,
          form.shape
        );
        const created = await apiPost<Table>("/api/tables", {
          ...payload,
          posX: layout.posX,
          posY: layout.posY,
          width: layout.tableWidth,
          height: layout.tableHeight,
        });
        const merged = applyFittedLayout(
          [...tables, { ...created, orders: [], reservations: [] }],
          layout
        );
        setTables(merged);
        setSections(layout.sections);
        setPlanWidth(layout.width);
        setPlanHeight(layout.height);
        await persistLayout(layout.sections, merged, layout.width, layout.height);
        setLayoutDirty(false);
      }
      setModalOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this table?")) return;
    await apiDelete(`/api/tables/${id}`);
    setTables((prev) => prev.filter((t) => t.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  const toggleStatus = async (table: Table) => {
    const next = table.status === "available" ? "occupied" : "available";
    const updated = await apiPatch<Table>(`/api/tables/${table.id}`, { status: next });
    setTables((prev) =>
      prev.map((t) => (t.id === table.id ? { ...t, ...updated, orders: t.orders } : t))
    );
  };

  const onMoveTable = (id: string, posX: number, posY: number) => {
    const merged = tables.map((t) => (t.id === id ? { ...t, posX, posY } : t));
    const fitted = fitFloorPlanToTables(
      sections,
      toTableBounds(merged),
      planWidth,
      planHeight
    );
    setTables(applyFittedLayout(merged, fitted));
    setSections(fitted.sections);
    setPlanWidth(fitted.width);
    setPlanHeight(fitted.height);
    setLayoutDirty(true);
  };

  const saveLayout = async () => {
    setSavingLayout(true);
    try {
      const fitted = fitFloorPlanToTables(
        sections,
        toTableBounds(tables),
        planWidth,
        planHeight
      );
      const merged = applyFittedLayout(tables, fitted);
      setTables(merged);
      setSections(fitted.sections);
      setPlanWidth(fitted.width);
      setPlanHeight(fitted.height);
      await persistLayout(fitted.sections, merged, fitted.width, fitted.height);
      setLayoutDirty(false);
      setEditMode(false);
    } finally {
      setSavingLayout(false);
    }
  };

  const selectedTable = tables.find((t) => t.id === selectedId);

  const available = tables.filter((t) => t.status === "available").length;
  const occupied = tables.filter((t) => t.status === "occupied").length;
  const reserved = tables.filter((t) => t.status === "reserved").length;

  const tabs: { id: TabId; label: string; icon: React.ReactNode }[] = [
    { id: "floor", label: "Floor plan", icon: <Map className="h-4 w-4" /> },
    { id: "list", label: "List", icon: <List className="h-4 w-4" /> },
    { id: "reservations", label: "Reservations", icon: <Calendar className="h-4 w-4" /> },
  ];

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex gap-4 text-sm">
          <span className="text-green-600">{available} available</span>
          <span className="text-orange-600">{occupied} occupied</span>
          <span className="text-blue-600">{reserved} reserved</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {tab === "floor" && (
            <>
              <Button
                variant={editMode ? "primary" : "secondary"}
                size="sm"
                onClick={() => setEditMode((e) => !e)}
              >
                {editMode ? "Editing layout" : "Edit layout"}
              </Button>
              {layoutDirty && (
                <Button size="sm" onClick={saveLayout} disabled={savingLayout}>
                  <Save className="h-4 w-4" />
                  {savingLayout ? "Saving…" : "Save layout"}
                </Button>
              )}
            </>
          )}
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" />
            Add Table
          </Button>
        </div>
      </div>

      <ScrollableTabs className="mb-6 gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1" menuLabel="Tables">
        {tabs.map((t) => (
          <TabPill
            key={t.id}
            id={t.id}
            active={tab === t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              tab === t.id && "bg-white text-slate-900 shadow-sm hover:bg-white"
            )}
          >
            {t.icon}
            {t.label}
          </TabPill>
        ))}
      </ScrollableTabs>

      {tab === "floor" && (
        <PageSectionShell pageId="tables-floor">
        <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
          <PageSection id="floor-canvas" title="Floor plan" defaultOpen>
            {tables.length === 0 ? (
              <EmptyState
                icon={<LayoutGrid className="h-12 w-12" />}
                title="No tables configured"
                description="Add tables and drag them into your custom floor plan."
                action={<Button onClick={openCreate}>Add Table</Button>}
              />
            ) : (
              <FloorPlanCanvas
                width={planWidth}
                height={planHeight}
                sections={sections}
                tables={query.trim() ? visibleTables : tables}
                editMode={editMode}
                selectedId={selectedId}
                onSelect={setSelectedId}
                onMoveTable={onMoveTable}
              />
            )}
          </PageSection>

          <PageSection id="floor-details" title="Table details">
            {selectedTable ? (
              <div className="space-y-3 text-sm">
                <p>
                  <span className="text-slate-500">Number</span>
                  <br />
                  <span className="text-lg font-bold">Table {selectedTable.number}</span>
                </p>
                <p>
                  <span className="text-slate-500">Capacity</span>
                  <br />
                  {selectedTable.capacity} guests
                </p>
                <p>
                  <span className="text-slate-500">Status</span>
                  <br />
                  <Badge className="mt-1 capitalize">{selectedTable.status}</Badge>
                </p>
                {selectedTable.reservations?.[0] && (
                  <p>
                    <span className="text-slate-500">Next reservation</span>
                    <br />
                    {selectedTable.reservations[0].guestName} · party of{" "}
                    {selectedTable.reservations[0].partySize}
                  </p>
                )}
                <div className="flex flex-wrap gap-2 pt-2">
                  <Button size="sm" variant="secondary" onClick={() => toggleStatus(selectedTable)}>
                    Toggle status
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => openEdit(selectedTable)}>
                    <Pencil className="h-3 w-3" />
                    Edit
                  </Button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-500">
                Click a table on the floor plan to view details and quick actions.
              </p>
            )}

            {editMode && (
              <div className="mt-4 border-t pt-4 text-xs text-slate-500">
                <p className="font-medium text-slate-700">Layout tips</p>
                <ul className="mt-2 list-inside list-disc space-y-1">
                  <li>Drag tables into dining zones</li>
                  <li>Use bar shapes for high-top seating</li>
                  <li>Save layout when finished</li>
                </ul>
              </div>
            )}
          </PageSection>
        </div>
        </PageSectionShell>
      )}

      {tab === "list" && (
        <PageSectionShell pageId="tables-list">
          <PageSection id="table-grid" title="All tables" defaultOpen>
          {tables.length === 0 ? (
            <EmptyState
              icon={<LayoutGrid className="h-12 w-12" />}
              title="No tables configured"
              description="Set up your dining floor layout."
              action={<Button onClick={openCreate}>Add Table</Button>}
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {visibleTables.map((table) => (
                <div
                  key={table.id}
                  className={cn(
                    "relative rounded-xl border-2 p-4 transition-all hover:shadow-md",
                    STATUS_COLORS[table.status as keyof typeof STATUS_COLORS] ||
                      "bg-slate-50 border-slate-200"
                  )}
                >
                  <div className="text-center">
                    <p className="text-2xl font-bold">{table.number}</p>
                    <p className="text-xs opacity-75">{table.capacity} seats</p>
                    <Badge className="mt-2 bg-white/50 text-xs capitalize">{table.status}</Badge>
                    {table.orders.length > 0 && (
                      <p className="mt-1 text-xs font-medium">Active order</p>
                    )}
                  </div>
                  <div className="mt-3 flex justify-center gap-1">
                    <Button variant="ghost" size="sm" onClick={() => toggleStatus(table)}>
                      Toggle
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => openEdit(table)}>
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleDelete(table.id)}>
                      <Trash2 className="h-3 w-3 text-red-500" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
          </PageSection>
        </PageSectionShell>
      )}

      {tab === "reservations" && (
        <PageSectionShell pageId="tables-reservations">
          <PageSection id="reservations" title="Reservations" defaultOpen>
            <ReservationsPanel onReservationChange={reloadFloorPlan} />
          </PageSection>
        </PageSectionShell>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? "Edit Table" : "Add Table"}
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Table Number">
              <Input
                type="number"
                value={form.number}
                onChange={(e) => setForm({ ...form, number: e.target.value })}
              />
            </FormField>
            <FormField label="Label (optional)">
              <Input
                value={form.label}
                onChange={(e) => setForm({ ...form, label: e.target.value })}
                placeholder="Window booth"
              />
            </FormField>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Capacity">
              <Input
                type="number"
                value={form.capacity}
                onChange={(e) => setForm({ ...form, capacity: e.target.value })}
              />
            </FormField>
            <FormField label="Section">
              <Select
                value={form.section}
                onChange={(e) => setForm({ ...form, section: e.target.value })}
              >
                {sections.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
                <option value="main">Main</option>
              </Select>
            </FormField>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Shape">
              <Select
                value={form.shape}
                onChange={(e) => setForm({ ...form, shape: e.target.value })}
              >
                {SHAPES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Status">
              <Select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
              >
                <option value="available">Available</option>
                <option value="occupied">Occupied</option>
                <option value="reserved">Reserved</option>
              </Select>
            </FormField>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
