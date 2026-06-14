"use client";

import { useState } from "react";
import { Plus, Trash2, ClipboardList, ListPlus } from "lucide-react";
import { Button, Badge, EmptyState } from "@/components/ui";
import { Input, Select, Textarea, FormField, Modal } from "@/components/ui/form";
import { useAuth } from "@/components/auth/AuthProvider";
import { apiPost, apiPatch, apiDelete } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";
import { ORDER_STATUS_COLORS } from "@/lib/constants";

interface MenuItem {
  id: string;
  name: string;
  price: number;
  available: boolean;
}

interface Table {
  id: string;
  number: number;
}

interface OrderItem {
  id: string;
  quantity: number;
  price: number;
  menuItem: { name: string };
}

interface Order {
  id: string;
  status: string;
  totalAmount: number;
  notes: string | null;
  table: Table | null;
  items: OrderItem[];
}

const STATUSES = ["PENDING", "PREPARING", "READY", "SERVED", "PAID", "CANCELLED"];

const CHANNELS = ["dine-in", "pickup", "delivery", "catering"] as const;

export function OrdersClient({
  initialOrders,
  menuItems,
  tables,
}: {
  initialOrders: Order[];
  menuItems: MenuItem[];
  tables: Table[];
}) {
  const { can } = useAuth();
  const canManage = can("manage_orders");
  const canPlace = can("place_orders");
  const canAddToCheck = can("add_to_check");

  const [orders, setOrders] = useState(initialOrders);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);
  const [form, setForm] = useState({
    tableId: "",
    menuItemId: "",
    quantity: "1",
    guestCount: "2",
    channel: "dine-in",
    notes: "",
  });
  const [addForm, setAddForm] = useState({ menuItemId: "", quantity: "1" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const availableMenu = menuItems.filter((m) => m.available);

  const handleCreate = async () => {
    if (!form.menuItemId) {
      setError("Select a menu item");
      return;
    }
    const menuItem = menuItems.find((m) => m.id === form.menuItemId);
    if (!menuItem) return;

    setSaving(true);
    try {
      const quantity = parseInt(form.quantity) || 1;
      const order = await apiPost<Order>("/api/orders", {
        tableId: form.tableId || null,
        totalAmount: menuItem.price * quantity,
        guestCount: parseInt(form.guestCount) || 1,
        channel: form.channel,
        notes: form.notes || null,
        items: [{ menuItemId: form.menuItemId, quantity, price: menuItem.price }],
      });
      setOrders((prev) => [order, ...prev]);
      setCreateModalOpen(false);
      setForm({ tableId: "", menuItemId: "", quantity: "1", guestCount: "2", channel: "dine-in", notes: "" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create order");
    } finally {
      setSaving(false);
    }
  };

  const handleAddToCheck = async () => {
    if (!activeOrderId || !addForm.menuItemId) {
      setError("Select a menu item");
      return;
    }
    const menuItem = menuItems.find((m) => m.id === addForm.menuItemId);
    if (!menuItem) return;

    setSaving(true);
    setError(null);
    try {
      const quantity = parseInt(addForm.quantity) || 1;
      const updated = await apiPost<Order>(`/api/orders/${activeOrderId}/items`, {
        menuItemId: addForm.menuItemId,
        quantity,
        price: menuItem.price,
      });
      setOrders((prev) => prev.map((o) => (o.id === activeOrderId ? updated : o)));
      setAddModalOpen(false);
      setAddForm({ menuItemId: "", quantity: "1" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add item");
    } finally {
      setSaving(false);
    }
  };

  const updateStatus = async (id: string, status: string) => {
    const updated = await apiPatch<Order>(`/api/orders/${id}`, { status });
    setOrders((prev) => prev.map((o) => (o.id === id ? updated : o)));
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this order?")) return;
    await apiDelete(`/api/orders/${id}`);
    setOrders((prev) => prev.filter((o) => o.id !== id));
  };

  const openAddModal = (orderId: string) => {
    setActiveOrderId(orderId);
    setAddForm({ menuItemId: "", quantity: "1" });
    setError(null);
    setAddModalOpen(true);
  };

  return (
    <>
      {canPlace && (
        <div className="mb-6 flex justify-end">
          <Button onClick={() => setCreateModalOpen(true)}>
            <Plus className="h-4 w-4" />
            New Order
          </Button>
        </div>
      )}

      {orders.length === 0 ? (
        <EmptyState
          icon={<ClipboardList className="h-12 w-12" />}
          title="No orders yet"
          description="Create an order to start tracking."
          action={
            canPlace ? (
              <Button onClick={() => setCreateModalOpen(true)}>New Order</Button>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-4">
          {orders.map((order) => (
            <div key={order.id} className="card">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-slate-900">Order #{order.id.slice(-6)}</h3>
                    <Badge className={ORDER_STATUS_COLORS[order.status as keyof typeof ORDER_STATUS_COLORS]}>
                      {order.status}
                    </Badge>
                  </div>
                  {order.table && (
                    <p className="mt-1 text-sm text-slate-500">Table {order.table.number}</p>
                  )}
                </div>
                <p className="text-lg font-bold text-slate-900">{formatCurrency(order.totalAmount)}</p>
              </div>
              {order.items.length > 0 && (
                <ul className="mt-4 space-y-1 text-sm text-slate-600">
                  {order.items.map((item) => (
                    <li key={item.id}>
                      {item.quantity}x {item.menuItem.name} — {formatCurrency(item.price)}
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-4 flex flex-wrap items-center gap-2">
                {canAddToCheck &&
                  order.status !== "PAID" &&
                  order.status !== "CANCELLED" && (
                    <Button variant="secondary" size="sm" onClick={() => openAddModal(order.id)}>
                      <ListPlus className="h-3 w-3" />
                      Add to check
                    </Button>
                  )}
                {canManage && (
                  <>
                    <Select
                      value={order.status}
                      onChange={(e) => updateStatus(order.id, e.target.value)}
                      className="w-auto"
                    >
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </Select>
                    <Button variant="ghost" size="sm" onClick={() => handleDelete(order.id)}>
                      <Trash2 className="h-3 w-3 text-red-500" />
                    </Button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* New order modal */}
      <Modal open={createModalOpen} onClose={() => setCreateModalOpen(false)} title="New Order">
        <div className="space-y-4">
          <FormField label="Menu Item">
            <Select value={form.menuItemId} onChange={(e) => setForm({ ...form, menuItemId: e.target.value })}>
              <option value="">Select item...</option>
              {availableMenu.map((m) => (
                <option key={m.id} value={m.id}>{m.name} — {formatCurrency(m.price)}</option>
              ))}
            </Select>
          </FormField>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Quantity">
              <Input type="number" min="1" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
            </FormField>
            <FormField label="Guests">
              <Input type="number" min="1" value={form.guestCount} onChange={(e) => setForm({ ...form, guestCount: e.target.value })} />
            </FormField>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Table">
              <Select value={form.tableId} onChange={(e) => setForm({ ...form, tableId: e.target.value })}>
                <option value="">No table</option>
                {tables.map((t) => (
                  <option key={t.id} value={t.id}>Table {t.number}</option>
                ))}
              </Select>
            </FormField>
            <FormField label="Channel">
              <Select value={form.channel} onChange={(e) => setForm({ ...form, channel: e.target.value })}>
                {CHANNELS.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </Select>
            </FormField>
          </div>
          <FormField label="Notes">
            <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} />
          </FormField>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setCreateModalOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={saving}>{saving ? "Creating..." : "Create Order"}</Button>
          </div>
        </div>
      </Modal>

      {/* Add to check modal */}
      <Modal open={addModalOpen} onClose={() => setAddModalOpen(false)} title="Add to Check">
        <div className="space-y-4">
          <p className="text-sm text-slate-500">Add an item to an open order check.</p>
          <FormField label="Menu Item">
            <Select value={addForm.menuItemId} onChange={(e) => setAddForm({ ...addForm, menuItemId: e.target.value })}>
              <option value="">Select item...</option>
              {availableMenu.map((m) => (
                <option key={m.id} value={m.id}>{m.name} — {formatCurrency(m.price)}</option>
              ))}
            </Select>
          </FormField>
          <FormField label="Quantity">
            <Input type="number" min="1" value={addForm.quantity} onChange={(e) => setAddForm({ ...addForm, quantity: e.target.value })} />
          </FormField>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setAddModalOpen(false)}>Cancel</Button>
            <Button onClick={handleAddToCheck} disabled={saving}>{saving ? "Adding..." : "Add item"}</Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
