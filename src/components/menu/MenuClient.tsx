"use client";

import { useMemo, useState } from "react";
import { Pencil, Plus, Trash2, Utensils, ChefHat } from "lucide-react";
import { Button, Badge, EmptyState } from "@/components/ui";
import {
  CollapsibleSection,
  CollapsibleGroup,
  CollapsibleGroupControls,
} from "@/components/ui";
import { PageSectionShell, PageSection } from "@/components/layout/PageSections";
import { Input, Select, Textarea, FormField, Modal } from "@/components/ui/form";
import { apiPost, apiPatch, apiDelete } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";
import { filterBySearchQuery } from "@/lib/search/text-match";
import { usePageSearch } from "@/hooks/usePageSearch";
import { MENU_COURSES, MENU_COURSE_LABELS, type MenuCourseId } from "@/lib/kitchen/courses";
import {
  SALES_CATEGORIES,
  SALES_CATEGORY_LABELS,
  type SalesCategoryId,
} from "@/lib/menu/sales-categories";
import { quadrantBadge } from "@/components/menu/MenuEngineeringPanel";
import { RecipeBuilderModal } from "@/components/menu/RecipeBuilderModal";
import type { MenuEngineeringRow } from "@/lib/menu/engineering";

interface MenuItem {
  id: string;
  name: string;
  description: string | null;
  price: number;
  category: string;
  salesCategory?: string;
  recipeCost?: number;
  available: boolean;
  kitchenStationId?: string | null;
  defaultCourse?: string;
  isCombo?: boolean;
}

interface KitchenStationOption {
  id: string;
  name: string;
}

interface InventoryOption {
  id: string;
  name: string;
  unit: string;
  costPerUnit: number;
  yieldPct?: number;
}

interface MenuClientProps {
  initialItems: MenuItem[];
  stations?: KitchenStationOption[];
  engineeringByItemId?: Record<string, MenuEngineeringRow>;
  inventory?: InventoryOption[];
}

const CATEGORIES = [
  "Entrees",
  "Burgers",
  "Salads",
  "Pizza",
  "Desserts",
  "Beer",
  "Cocktails",
  "Beverages",
  "Appetizers",
  "Sides",
];

export function MenuClient({
  initialItems,
  stations = [],
  engineeringByItemId = {},
  inventory = [],
}: MenuClientProps) {
  const [items, setItems] = useState(initialItems);
  const { query } = usePageSearch();
  const [modalOpen, setModalOpen] = useState(false);
  const [recipeItem, setRecipeItem] = useState<MenuItem | null>(null);
  const [editing, setEditing] = useState<MenuItem | null>(null);
  const [form, setForm] = useState({
    name: "",
    description: "",
    price: "",
    category: "Entrees",
    salesCategory: "FOOD" as SalesCategoryId,
    available: true,
    kitchenStationId: "",
    defaultCourse: "MAIN" as MenuCourseId,
    isCombo: false,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const engineeringMap = useMemo(() => engineeringByItemId, [engineeringByItemId]);

  const openCreate = () => {
    setEditing(null);
    setForm({
      name: "",
      description: "",
      price: "",
      category: "Entrees",
      salesCategory: "FOOD",
      available: true,
      kitchenStationId: "",
      defaultCourse: "MAIN",
      isCombo: false,
    });
    setError(null);
    setModalOpen(true);
  };

  const openEdit = (item: MenuItem) => {
    setEditing(item);
    setForm({
      name: item.name,
      description: item.description || "",
      price: String(item.price),
      category: item.category,
      salesCategory: (item.salesCategory as SalesCategoryId) || "FOOD",
      available: item.available,
      kitchenStationId: item.kitchenStationId ?? "",
      defaultCourse: (item.defaultCourse as MenuCourseId) || "MAIN",
      isCombo: item.isCombo ?? false,
    });
    setError(null);
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.name || !form.price) {
      setError("Name and price are required");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        name: form.name,
        description: form.description || null,
        price: parseFloat(form.price),
        category: form.category,
        salesCategory: form.salesCategory,
        available: form.available,
        kitchenStationId: form.kitchenStationId || null,
        defaultCourse: form.defaultCourse,
        isCombo: form.isCombo,
      };
      if (editing) {
        const updated = await apiPatch<MenuItem>(`/api/menu/${editing.id}`, payload);
        setItems((prev) => prev.map((i) => (i.id === editing.id ? updated : i)));
      } else {
        const created = await apiPost<MenuItem>("/api/menu", payload);
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
    if (!confirm("Delete this menu item?")) return;
    await apiDelete(`/api/menu/${id}`);
    setItems((prev) => prev.filter((i) => i.id !== id));
  };

  const visibleItems = useMemo(
    () =>
      filterBySearchQuery(items, query, (item) => [
        item.name,
        item.category,
        item.description,
        item.salesCategory,
      ]),
    [items, query]
  );

  const grouped = visibleItems.reduce(
    (acc, item) => {
      if (!acc[item.category]) acc[item.category] = [];
      acc[item.category].push(item);
      return acc;
    },
    {} as Record<string, MenuItem[]>
  );

  const categoryEntries = Object.entries(grouped);

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" />
          Add Item
        </Button>
      </div>

      {visibleItems.length === 0 ? (
        <EmptyState
          icon={<Utensils className="h-12 w-12" />}
          title={query.trim() ? "No matching menu items" : "No menu items yet"}
          description={
            query.trim()
              ? "Try a different search term."
              : "Add your first menu item to get started."
          }
          action={!query.trim() ? <Button onClick={openCreate}>Add Item</Button> : undefined}
        />
      ) : (
        <PageSectionShell
          pageId="menu-items-list"
          defaultExpanded={query.trim() ? "all" : "first"}
        >
          {categoryEntries.map(([category, categoryItems]) => (
            <PageSection
              key={category}
              id={`menu-cat-${category}`}
              title={category}
              badge={
                <Badge className="bg-slate-100 text-slate-700">
                  {categoryItems.length} items
                </Badge>
              }
            >
              <CollapsibleGroup
                defaultExpanded={query.trim() ? "all" : "none"}
                expandKey={`${category}-${query.trim()}`}
              >
                <CollapsibleGroupControls className="mb-3" />
                <div className="space-y-2">
                  {categoryItems.map((item) => {
                    const eng = engineeringMap[item.id];
                    const recipeCost = item.recipeCost ?? item.price * 0.28;
                    const marginPct =
                      item.price > 0 ? ((item.price - recipeCost) / item.price) * 100 : 0;
                    const foodCostPct = item.price > 0 ? (recipeCost / item.price) * 100 : 0;

                    return (
                      <CollapsibleSection
                        key={item.id}
                        id={`menu-item-${item.id}`}
                        title={item.name}
                        variant="plain"
                        bodyClassName="!pt-2"
                        badge={
                          <span className="flex flex-wrap items-center gap-1">
                            {eng && quadrantBadge(eng.quadrant)}
                            <Badge
                              className={
                                item.available
                                  ? "bg-green-100 text-green-700"
                                  : "bg-red-100 text-red-700"
                              }
                            >
                              {item.available ? "Available" : "Unavailable"}
                            </Badge>
                          </span>
                        }
                        headerActions={
                          <span className="text-sm font-bold text-orange-600">
                            {formatCurrency(item.price)}
                          </span>
                        }
                      >
                        <div className="rounded-lg border border-slate-200 bg-white p-3">
                          {item.description && (
                            <p className="text-sm text-slate-500">{item.description}</p>
                          )}
                          <p className="mt-1 text-xs text-slate-400">
                            {SALES_CATEGORY_LABELS[(item.salesCategory as SalesCategoryId) || "FOOD"]}
                          </p>
                          <p className="mt-2 text-xs text-slate-500">
                            FC {foodCostPct.toFixed(0)}% · {marginPct.toFixed(0)}% margin
                          </p>
                          {eng && eng.quantitySold > 0 && (
                            <p className="mt-1 text-xs text-slate-500">
                              {eng.quantitySold} sold · {eng.popularityPct.toFixed(1)}% of mix
                            </p>
                          )}
                          <div className="mt-3 flex flex-wrap gap-2">
                            <Button variant="secondary" size="sm" onClick={() => openEdit(item)}>
                              <Pencil className="h-3 w-3" />
                              Edit
                            </Button>
                            <Button variant="secondary" size="sm" onClick={() => setRecipeItem(item)}>
                              <ChefHat className="h-3 w-3" />
                              Recipe
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => handleDelete(item.id)}>
                              <Trash2 className="h-3 w-3 text-red-500" />
                            </Button>
                          </div>
                        </div>
                      </CollapsibleSection>
                    );
                  })}
                </div>
              </CollapsibleGroup>
            </PageSection>
          ))}
        </PageSectionShell>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? "Edit Menu Item" : "Add Menu Item"}
      >
        <CollapsibleGroup defaultExpanded="all" expandKey={editing?.id ?? "new-item"}>
          <CollapsibleGroupControls className="mb-3" />
          <div className="space-y-3">
            <CollapsibleSection id="item-basics" title="Basics" defaultOpen variant="plain" bodyClassName="!pt-2">
              <div className="space-y-4">
                <FormField label="Name">
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </FormField>
                <FormField label="Description">
                  <Textarea
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    rows={2}
                  />
                </FormField>
              </div>
            </CollapsibleSection>

            <CollapsibleSection id="item-pricing" title="Pricing & categories" defaultOpen variant="plain" bodyClassName="!pt-2">
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <FormField label="Price">
                    <Input
                      type="number"
                      step="0.01"
                      value={form.price}
                      onChange={(e) => setForm({ ...form, price: e.target.value })}
                    />
                  </FormField>
                  <FormField label="POS category">
                    <Select
                      value={form.category}
                      onChange={(e) => setForm({ ...form, category: e.target.value })}
                    >
                      {CATEGORIES.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </Select>
                  </FormField>
                </div>
                <FormField label="Sales category (accounting)">
                  <Select
                    value={form.salesCategory}
                    onChange={(e) =>
                      setForm({ ...form, salesCategory: e.target.value as SalesCategoryId })
                    }
                  >
                    {SALES_CATEGORIES.map((c) => (
                      <option key={c} value={c}>{SALES_CATEGORY_LABELS[c]}</option>
                    ))}
                  </Select>
                </FormField>
                <FormField label="Availability">
                  <Select
                    value={form.available ? "true" : "false"}
                    onChange={(e) => setForm({ ...form, available: e.target.value === "true" })}
                  >
                    <option value="true">Available</option>
                    <option value="false">Unavailable</option>
                  </Select>
                </FormField>
              </div>
            </CollapsibleSection>

            <CollapsibleSection id="item-kitchen" title="Kitchen routing" defaultOpen variant="plain" bodyClassName="!pt-2">
              <div className="space-y-4">
                {stations.length > 0 && (
                  <FormField label="Kitchen station">
                    <Select
                      value={form.kitchenStationId}
                      onChange={(e) => setForm({ ...form, kitchenStationId: e.target.value })}
                    >
                      <option value="">Auto (by category)</option>
                      {stations.map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </Select>
                  </FormField>
                )}
                <div className="grid grid-cols-2 gap-4">
                  <FormField label="Default course">
                    <Select
                      value={form.defaultCourse}
                      onChange={(e) => setForm({ ...form, defaultCourse: e.target.value as MenuCourseId })}
                    >
                      {MENU_COURSES.map((c) => (
                        <option key={c} value={c}>{MENU_COURSE_LABELS[c]}</option>
                      ))}
                    </Select>
                  </FormField>
                  <FormField label="Combo item">
                    <Select
                      value={form.isCombo ? "true" : "false"}
                      onChange={(e) => setForm({ ...form, isCombo: e.target.value === "true" })}
                    >
                      <option value="false">Single item</option>
                      <option value="true">Combo (splits to stations)</option>
                    </Select>
                  </FormField>
                </div>
              </div>
            </CollapsibleSection>
          </div>
        </CollapsibleGroup>

        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </Button>
        </div>
      </Modal>

      <RecipeBuilderModal
        open={!!recipeItem}
        menuItem={recipeItem}
        inventory={inventory}
        menuItems={items.map((i) => ({
          id: i.id,
          name: i.name,
          category: i.category,
          recipeCost: i.recipeCost ?? 0,
        }))}
        onClose={() => setRecipeItem(null)}
        onSaved={(recipeCost) => {
          if (!recipeItem) return;
          setItems((prev) =>
            prev.map((i) => (i.id === recipeItem.id ? { ...i, recipeCost } : i))
          );
        }}
      />
    </>
  );
}
