"use client";

import { useState, type Dispatch, type SetStateAction } from "react";
import Link from "next/link";
import { Plus, Trash2, ClipboardList, ListPlus, Wallet, Zap } from "lucide-react";
import type { CheckStatus, PaymentMethod } from "@prisma/client";
import { Button, Badge, EmptyState } from "@/components/ui";
import { Select } from "@/components/ui/form";
import { useAuth } from "@/components/auth/AuthProvider";
import { apiPost, apiPatch, apiDelete } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";
import { ORDER_STATUS_COLORS } from "@/lib/constants";
import {
  CHECK_STATUS_COLORS,
  CHECK_STATUS_LABELS,
  getOrderBalanceDue,
  getPaymentsTotal,
  getTipsTotal,
  hasPaymentsAttached,
  ORDER_STATUSES,
  PAYMENT_METHOD_LABELS,
} from "@/lib/orders";
import { PayCheckScreen, type PayableOrder } from "@/components/orders/PayCheckScreen";
import { OrderMenuSheet, type OrderMenuItem, type OrderMenuSubmitPayload } from "@/components/orders/OrderMenuSheet";
import { useMenuSync } from "@/hooks/useMenuSync";

interface Table {
  id: string;
  number: number;
  capacity: number;
}

interface OrderPayment {
  id: string;
  method: PaymentMethod;
  amount: number;
  tipAmount: number;
  reference: string | null;
  createdAt?: string | Date;
}

interface Order extends PayableOrder {
  notes: string | null;
  checkStatus?: CheckStatus;
  payments?: OrderPayment[];
}

const STATUSES = [...ORDER_STATUSES];

export function OrdersClient({
  orders,
  setOrders,
  menuItems: initialMenuItems,
  tables,
  initialMenuRevision = 0,
}: {
  orders: Order[];
  setOrders: Dispatch<SetStateAction<Order[]>>;
  menuItems: OrderMenuItem[];
  tables: Table[];
  initialMenuRevision?: number;
}) {
  const { can } = useAuth();
  const canManage = can("manage_orders");
  const canPlace = can("place_orders");
  const canAddToCheck = can("add_to_check");
  const canTakePayment = canManage || canPlace;

  const [menuItems, setMenuItems] = useState(initialMenuItems);
  const [menuRevision, setMenuRevision] = useState(initialMenuRevision);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshMenu = async () => {
    try {
      const res = await fetch("/api/pos/config");
      if (!res.ok) return;
      const data = await res.json();
      setMenuItems(data.menuItems ?? []);
      setMenuRevision(data.menuRevision ?? 0);
    } catch {
      /* ignore */
    }
  };

  useMenuSync(menuRevision, refreshMenu, true);

  const activeOrder = orders.find((o) => o.id === activeOrderId) ?? null;

  const handleCreate = async (payload: OrderMenuSubmitPayload) => {
    setSaving(true);
    setError(null);
    try {
      const order = await apiPost<Order>("/api/orders", {
        tableId: payload.tableId,
        totalAmount: payload.price * payload.quantity,
        guestCount: payload.guestCount ?? 1,
        channel: payload.channel ?? "dine-in",
        notes: payload.notes ?? null,
        items: [
          {
            menuItemId: payload.menuItemId,
            quantity: payload.quantity,
            price: payload.price,
            seatNumber: payload.seatNumber,
            modifiers: payload.modifiers,
            modifierSummary: payload.modifierSummary,
          },
        ],
      });
      setOrders((prev) => [order, ...prev]);
      setCreateModalOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create order");
    } finally {
      setSaving(false);
    }
  };

  const handleAddToCheck = async (payload: OrderMenuSubmitPayload) => {
    if (!activeOrderId) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await apiPost<Order>(`/api/orders/${activeOrderId}/items`, {
        menuItemId: payload.menuItemId,
        quantity: payload.quantity,
        price: payload.price,
        seatNumber: payload.seatNumber,
        modifiers: payload.modifiers,
        modifierSummary: payload.modifierSummary,
        fireToKitchen: true,
      });
      setOrders((prev) => prev.map((o) => (o.id === activeOrderId ? updated : o)));
      setAddModalOpen(false);
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
    setError(null);
    setAddModalOpen(true);
  };

  const openPaymentModal = (orderId: string) => {
    setActiveOrderId(orderId);
    setPaymentModalOpen(true);
  };

  const handlePaid = (order: PayableOrder) => {
    setOrders((prev) =>
      prev.map((o) =>
        o.id === order.id
          ? { ...o, ...order, payments: order.payments ?? [], checks: order.checks ?? [] }
          : o
      )
    );
  };

  return (
    <>
      {canPlace && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-slate-500">
            Add items here or use the <strong>Serve</strong> tab for rush mode.
          </p>
          <Button onClick={() => { setError(null); setCreateModalOpen(true); }}>
            <Plus className="h-4 w-4" />
            New Order
          </Button>
        </div>
      )}

      {orders.length === 0 ? (
        <EmptyState
          icon={<ClipboardList className="h-12 w-12" />}
          title="No orders yet"
          description="Tap New Order to pick items from the color-coded menu grid."
          action={
            canPlace ? (
              <Button onClick={() => setCreateModalOpen(true)}>New Order</Button>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-4">
          {orders.map((order) => {
            const balanceDue = getOrderBalanceDue(order, order.payments ?? []);
            const paidTotal = getPaymentsTotal(order.payments ?? []);
            const tipTotal = getTipsTotal(order.payments ?? []);
            const isOpen =
              order.checkStatus !== "CLOSED" &&
              order.status !== "PAID" &&
              order.status !== "CANCELLED";
            const checkStatus = (order.checkStatus ?? "OPEN") as CheckStatus;
            const canModifyCheck = isOpen && !hasPaymentsAttached(order.payments);

            return (
              <div key={order.id} className="card">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold text-slate-900">Order #{order.id.slice(-6)}</h3>
                      <Badge className={ORDER_STATUS_COLORS[order.status as keyof typeof ORDER_STATUS_COLORS]}>
                        {order.status}
                      </Badge>
                      <Badge className={CHECK_STATUS_COLORS[checkStatus]}>
                        {CHECK_STATUS_LABELS[checkStatus]}
                      </Badge>
                    </div>
                    {order.table && (
                      <p className="mt-1 text-sm text-slate-500">Table {order.table.number}</p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold text-slate-900">{formatCurrency(order.totalAmount)}</p>
                    {isOpen && paidTotal > 0 && (
                      <p className="text-xs text-slate-500">
                        {formatCurrency(balanceDue)} remaining
                      </p>
                    )}
                  </div>
                </div>
                {order.items.length > 0 && (
                  <ul className="mt-4 space-y-1 text-sm text-slate-600">
                    {order.items.map((item) => (
                      <li key={item.id}>
                        {item.quantity}x {item.menuItem.name}
                        {item.seatNumber ? ` (Seat ${item.seatNumber})` : ""}
                        {item.modifierSummary ? ` — ${item.modifierSummary}` : ""} —{" "}
                        {formatCurrency(item.price)}
                      </li>
                    ))}
                  </ul>
                )}
                {(order.payments?.length ?? 0) > 0 && (
                  <div className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Payments</p>
                    <ul className="mt-1 space-y-1">
                      {(order.payments ?? []).map((payment) => (
                        <li key={payment.id} className="flex justify-between gap-3">
                          <span>
                            {PAYMENT_METHOD_LABELS[payment.method]}
                            {payment.reference ? ` (${payment.reference})` : ""}
                          </span>
                          <span className="font-medium text-slate-800">
                            {formatCurrency(payment.amount)}
                            {payment.tipAmount > 0 ? ` + ${formatCurrency(payment.tipAmount)} tip` : ""}
                          </span>
                        </li>
                      ))}
                    </ul>
                    {tipTotal > 0 && (
                      <p className="mt-2 text-xs text-slate-500">Total tips: {formatCurrency(tipTotal)}</p>
                    )}
                  </div>
                )}
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  {canTakePayment && order.status !== "CANCELLED" && (
                    <Button size="sm" onClick={() => openPaymentModal(order.id)}>
                      <Wallet className="h-3 w-3" />
                      {order.checkStatus === "CLOSED" ? "View Check" : "Pay Check"}
                    </Button>
                  )}
                  {canAddToCheck && canModifyCheck && (
                    <Button variant="secondary" size="sm" onClick={() => openAddModal(order.id)}>
                      <ListPlus className="h-3 w-3" />
                      Add to check
                    </Button>
                  )}
                  {canPlace && (
                    <Link
                      href="/orders?view=serve"
                      className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
                    >
                      <Zap className="h-3 w-3" />
                      Serve
                    </Link>
                  )}
                  {canPlace && (
                    <Select
                      value={order.status}
                      onChange={(e) => updateStatus(order.id, e.target.value)}
                      className="w-auto"
                    >
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </Select>
                  )}
                  {canManage && (
                    <Button variant="ghost" size="sm" onClick={() => handleDelete(order.id)}>
                      <Trash2 className="h-3 w-3 text-red-500" />
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <OrderMenuSheet
        open={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        title="New order — pick items"
        mode="create"
        menuItems={menuItems}
        tables={tables}
        submitLabel="Create order"
        saving={saving}
        error={error}
        onSubmit={handleCreate}
      />

      <OrderMenuSheet
        open={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        title="Add to check"
        mode="add"
        menuItems={menuItems}
        orderTable={
          activeOrder?.table
            ? tables.find((t) => t.id === activeOrder.table!.id) ?? null
            : null
        }
        submitLabel="Add to check"
        saving={saving}
        error={error}
        onSubmit={handleAddToCheck}
      />

      <PayCheckScreen
        open={paymentModalOpen}
        order={activeOrder}
        onClose={() => setPaymentModalOpen(false)}
        onUpdate={handlePaid}
      />
    </>
  );
}
