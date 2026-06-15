"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Banknote,
  CreditCard,
  Gift,
  Split,
  Percent,
  Lock,
  CircleDollarSign,
  Wallet,
  Smartphone,
  Receipt,
  Undo2,
  Unlock,
  Pencil,
} from "lucide-react";
import type { CheckStatus, PaymentMethod } from "@prisma/client";
import { Button, Badge } from "@/components/ui";
import { Input, FormField, Modal } from "@/components/ui/form";
import { useAuth } from "@/components/auth/AuthProvider";
import { apiPost } from "@/lib/api";
import { cn, formatCurrency } from "@/lib/utils";
import {
  CHECK_STATUS_COLORS,
  CHECK_STATUS_LABELS,
  DISCOUNT_TYPES,
  findTippablePayment,
  getCheckItemTotal,
  getOrderAmountDue,
  getOrderBalanceDue,
  getPaymentsTotal,
  getPaymentsNeedingTip,
  getTipsTotal,
  hasPaymentsAttached,
  needsTipEntry,
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  roundMoney,
} from "@/lib/orders";

interface OrderPayment {
  id: string;
  method: PaymentMethod;
  amount: number;
  tipAmount: number;
  reference: string | null;
  createdAt?: string | Date;
}

interface OrderItem {
  id: string;
  quantity: number;
  price: number;
  seatNumber?: number | null;
  checkId?: string | null;
  modifierSummary?: string | null;
  course?: string;
  kitchenStatus?: string;
  routesToKitchen?: boolean;
  parentOrderItemId?: string | null;
  kitchenStation?: { id: string; name: string; slug?: string } | null;
  menuItem: { name: string };
}

interface OrderCheck {
  id: string;
  label: string;
  seatNumber?: number | null;
  isClosed: boolean;
  items: OrderItem[];
}

export interface PayableOrder {
  id: string;
  status: string;
  checkStatus?: CheckStatus;
  totalAmount: number;
  discountAmount?: number | null;
  compAmount?: number | null;
  voidAmount?: number | null;
  discountReason?: string | null;
  partyName?: string | null;
  table: { id: string; number: number } | null;
  items: OrderItem[];
  payments?: OrderPayment[];
  checks?: OrderCheck[];
}

type Step = "review" | "style" | "pay" | "tip";
type PayStyle = "full" | "split" | "partial";

const METHOD_ICONS: Record<PaymentMethod, React.ComponentType<{ className?: string }>> = {
  CASH: Banknote,
  CARD: CreditCard,
  DEBIT: Wallet,
  MOBILE: Smartphone,
  GIFT_CARD: Gift,
  OTHER: CircleDollarSign,
};

const TIP_PRESETS = [15, 18, 20];

function quickCashAmounts(balance: number): number[] {
  const rounded = [Math.ceil(balance), Math.ceil(balance / 5) * 5, Math.ceil(balance / 10) * 10];
  return [...new Set(rounded.filter((v) => v >= balance))].slice(0, 4);
}

interface PayCheckScreenProps {
  open: boolean;
  order: PayableOrder | null;
  onClose: () => void;
  onUpdate: (order: PayableOrder) => void;
}

export function PayCheckScreen({ open, order, onClose, onUpdate }: PayCheckScreenProps) {
  const { user, can } = useAuth();
  const canManage = can("manage_orders");

  const [step, setStep] = useState<Step>("review");
  const [payStyle, setPayStyle] = useState<PayStyle>("full");
  const [method, setMethod] = useState<PaymentMethod>("CARD");
  const [amount, setAmount] = useState("");
  const [tipAmount, setTipAmount] = useState("");
  const [cashTendered, setCashTendered] = useState("");
  const [reference, setReference] = useState("");
  const [splitWays, setSplitWays] = useState("2");
  const [discountType, setDiscountType] = useState(DISCOUNT_TYPES[0].id);
  const [discountAmount, setDiscountAmount] = useState("");
  const [itemAssignments, setItemAssignments] = useState<Record<string, string>>({});
  const [panel, setPanel] = useState<"none" | "split" | "discount">("none");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastChange, setLastChange] = useState<number | null>(null);
  const [nextAction, setNextAction] = useState<string | null>(null);
  const [tipPaymentId, setTipPaymentId] = useState<string | null>(null);
  const [localOrder, setLocalOrder] = useState<PayableOrder | null>(order);

  useEffect(() => {
    setLocalOrder(order);
  }, [order]);

  const activeOrder = localOrder ?? order;
  const payments = activeOrder?.payments ?? [];
  const checks = activeOrder?.checks ?? [];
  const amountDue = activeOrder ? getOrderAmountDue(activeOrder) : 0;
  const paidSoFar = getPaymentsTotal(payments);
  const balanceDue = activeOrder ? getOrderBalanceDue(activeOrder, payments) : 0;
  const tipsSoFar = getTipsTotal(payments);
  const isClosed = activeOrder?.checkStatus === "CLOSED";
  const hasPayments = hasPaymentsAttached(payments);
  const paymentsNeedingTip = getPaymentsNeedingTip(payments) as OrderPayment[];
  const showTipPrompt = paymentsNeedingTip.length > 0;
  const tipTarget = (tipPaymentId
    ? payments.find((p) => p.id === tipPaymentId)
    : paymentsNeedingTip[paymentsNeedingTip.length - 1]) as OrderPayment | undefined;

  const paymentAmount = roundMoney(parseFloat(amount) || 0);
  const tip = roundMoney(parseFloat(tipAmount) || 0);
  const tendered = roundMoney(parseFloat(cashTendered) || 0);
  const changePreview =
    method === "CASH" && tendered > 0
      ? roundMoney(Math.max(0, tendered - paymentAmount - tip))
      : null;

  const unassignedItems = useMemo(
    () => activeOrder?.items.filter((i) => !i.checkId) ?? [],
    [activeOrder?.items]
  );

  useEffect(() => {
    if (!open || !activeOrder) return;
    const orderPayments = activeOrder.payments ?? [];
    const bal = getOrderBalanceDue(activeOrder, orderPayments);
    const pending = getPaymentsNeedingTip(orderPayments);

    setPayStyle("full");
    setMethod("CARD");
    setAmount(bal > 0 ? bal.toFixed(2) : "");
    setTipAmount("");
    setCashTendered("");
    setReference("");
    setPanel("none");
    setError(null);
    setLastChange(null);
    setNextAction(
      pending.length > 0
        ? "Add tip"
        : bal > 0
          ? "Take payment"
          : activeOrder.checkStatus === "CLOSED"
            ? null
            : "Close check"
    );
    setItemAssignments({});

    if (pending.length > 0 && activeOrder.checkStatus !== "CLOSED") {
      const target = findTippablePayment(orderPayments as OrderPayment[]);
      setTipPaymentId(target?.id ?? pending[pending.length - 1].id ?? null);
      setStep("tip");
    } else {
      setTipPaymentId(null);
      setStep("review");
    }
  }, [open, activeOrder?.id]);

  const resetPayFields = (nextBalance: number) => {
    setAmount(nextBalance > 0 ? nextBalance.toFixed(2) : "");
    setTipAmount("");
    setCashTendered("");
    setReference("");
    setLastChange(null);
  };

  useEffect(() => {
    if (!open || !activeOrder || activeOrder.checkStatus === "CLOSED") return;
    if (step === "tip" && tipTarget?.id && !tipPaymentId) {
      setTipPaymentId(tipTarget.id);
    }
  }, [open, activeOrder?.checkStatus, step, tipTarget?.id, tipPaymentId]);

  const applyOrder = (updated: PayableOrder, meta?: { changeDue?: number | null; nextAction?: string }) => {
    setLocalOrder(updated);
    onUpdate(updated);
    if (meta?.changeDue != null) setLastChange(meta.changeDue);
    if (meta?.nextAction) setNextAction(meta.nextAction);
    const newBalance = getOrderBalanceDue(updated, updated.payments ?? []);
    if (newBalance > 0) resetPayFields(newBalance);
  };

  const handlePay = async (overrideAmount?: number, overrideTip?: number) => {
    if (!activeOrder) return;
    const payAmt = overrideAmount ?? paymentAmount;
    const payTip = overrideTip ?? tip;
    if (payAmt <= 0 || payAmt > balanceDue + 0.001) return;

    setSaving(true);
    setError(null);
    try {
      const result = await apiPost<{
        order: PayableOrder;
        paymentId: string;
        changeDue: number | null;
        balanceDue: number;
        fullyPaid: boolean;
        needsTip: boolean;
        nextAction: string;
      }>(`/api/orders/${activeOrder.id}/pay`, {
        method,
        amount: payAmt,
        tipAmount: payTip,
        cashTendered: method === "CASH" && cashTendered ? tendered : undefined,
        reference: reference || undefined,
      });

      applyOrder(result.order, { changeDue: result.changeDue, nextAction: result.nextAction });

      if (result.needsTip) {
        setTipPaymentId(result.paymentId);
        setTipAmount("");
        setStep("tip");
      } else if (result.fullyPaid) {
        setStep("review");
      } else {
        setStep("review");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Payment failed");
    } finally {
      setSaving(false);
    }
  };

  const handleClose = async (skipTipWarning = false) => {
    if (!activeOrder) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/orders/${activeOrder.id}/close`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skipTipWarning }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 409 && data.requiresConfirmation) {
          if (window.confirm(data.error)) {
            await handleClose(true);
          }
          return;
        }
        throw new Error(data.error || "Failed to close check");
      }
      applyOrder(data.order);
      setNextAction("Check closed");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to close check");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveTip = async () => {
    const paymentId = tipPaymentId ?? tipTarget?.id;
    if (!activeOrder || !paymentId) {
      setError("No payment selected for tip");
      return;
    }
    const tip = roundMoney(parseFloat(tipAmount) || 0);

    setSaving(true);
    setError(null);
    try {
      const result = await apiPost<{
        order: PayableOrder;
        stillNeedsTip: boolean;
        nextAction: string;
      }>(`/api/orders/${activeOrder.id}/tip`, {
        paymentId,
        tipAmount: tip,
      });

      applyOrder(result.order, { nextAction: result.nextAction });

      if (result.stillNeedsTip) {
        const next = findTippablePayment((result.order.payments ?? []) as OrderPayment[]);
        setTipPaymentId(next?.id ?? null);
        setTipAmount("");
      } else {
        setTipPaymentId(null);
        setStep("review");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save tip");
    } finally {
      setSaving(false);
    }
  };

  const openTipEditor = (paymentId: string, existingTip = 0) => {
    if (!paymentId) {
      setError("No payment selected for tip");
      return;
    }
    setTipPaymentId(paymentId);
    setTipAmount(existingTip > 0 ? existingTip.toFixed(2) : "");
    setStep("tip");
    setPanel("none");
    setError(null);
  };

  const openTipForPending = () => {
    const target = findTippablePayment(payments);
    if (!target) {
      setError("No card payment found to tip");
      return;
    }
    openTipEditor(target.id, target.tipAmount);
  };

  const handleReopen = async () => {
    if (!activeOrder || !canManage) return;
    if (!window.confirm("Reopen this check to add a tip or make changes?")) return;

    setSaving(true);
    setError(null);
    try {
      const data = await apiPost<{ order: PayableOrder }>(`/api/orders/${activeOrder.id}/reopen`, {});
      applyOrder(data.order);
      setNextAction("Check reopened — add tip or edit payment");
      const target = findTippablePayment((data.order.payments ?? []) as OrderPayment[]);
      if (target) {
        openTipEditor(target.id, target.tipAmount);
      } else {
        setStep("review");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reopen check");
    } finally {
      setSaving(false);
    }
  };

  const handleVoidPayment = async (paymentId?: string) => {
    if (!activeOrder || !canManage) return;
    const paymentIdToVoid = paymentId;
    if (!window.confirm("Void this payment? The balance will be restored.")) return;
    setSaving(true);
    setError(null);
    try {
      const data = await apiPost<{ order: PayableOrder }>(`/api/orders/${activeOrder.id}/void-payment`, {
        paymentId: paymentIdToVoid,
      });
      applyOrder(data.order);
      setNextAction("Payment voided — review balance");
      setStep("review");
      setTipPaymentId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Void failed");
    } finally {
      setSaving(false);
    }
  };

  const handleDiscount = async () => {
    if (!activeOrder || !canManage) return;
    const amt = roundMoney(parseFloat(discountAmount) || 0);
    if (amt <= 0) return;
    setSaving(true);
    setError(null);
    try {
      const data = await apiPost<{ order: PayableOrder }>(`/api/orders/${activeOrder.id}/discount`, {
        type: discountType,
        amount: amt,
      });
      applyOrder(data.order);
      setPanel("none");
      setDiscountAmount("");
      resetPayFields(getOrderBalanceDue(data.order, data.order.payments ?? []));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Discount failed");
    } finally {
      setSaving(false);
    }
  };

  const handleSplit = async (mode: "even" | "seat" | "item") => {
    if (!activeOrder) return;
    setSaving(true);
    setError(null);
    try {
      const assignments =
        mode === "item"
          ? Object.entries(itemAssignments).map(([itemId, checkKey]) => ({
              itemId,
              checkId: checkKey || null,
            }))
          : [];
      const data = await apiPost<{ order: PayableOrder }>(`/api/orders/${activeOrder.id}/split`, {
        mode,
        ways: parseInt(splitWays, 10) || 2,
        assignments,
      });
      applyOrder(data.order);
      setPanel("none");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Split failed");
    } finally {
      setSaving(false);
    }
  };

  const startFullPay = (m: PaymentMethod) => {
    setPayStyle("full");
    setMethod(m);
    setAmount(balanceDue.toFixed(2));
    setStep("pay");
  };

  const startPartialPay = (m: PaymentMethod) => {
    setPayStyle("partial");
    setMethod(m);
    setStep("pay");
  };

  if (!activeOrder) return null;

  const headerLine = [
    activeOrder.table ? `Table ${activeOrder.table.number}` : null,
    activeOrder.partyName || null,
    user ? `Server: ${user.name}` : null,
  ]
    .filter(Boolean)
    .join(" — ");

  const canClose = balanceDue <= 0 && !isClosed;
  const checkStatus = activeOrder.checkStatus ?? "OPEN";

  return (
    <Modal open={open} onClose={onClose} title="Pay Check" size="full">
      <div className="space-y-5">
        {/* Header summary — always visible */}
        <div className="rounded-xl border-2 border-orange-200 bg-orange-50/60 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-slate-800">{headerLine || `Order #${activeOrder.id.slice(-6)}`}</p>
              <Badge className={cn("mt-2", CHECK_STATUS_COLORS[checkStatus])}>
                {CHECK_STATUS_LABELS[checkStatus]}
              </Badge>
            </div>
            <div className="text-right">
              <p className="text-xs uppercase tracking-wide text-slate-500">Remaining</p>
              <p className="text-4xl font-bold text-orange-700">{formatCurrency(balanceDue)}</p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-4 text-sm">
            <div>
              <span className="block text-xs text-slate-500">Total due</span>
              <span className="font-semibold text-slate-900">{formatCurrency(amountDue)}</span>
            </div>
            <div>
              <span className="block text-xs text-slate-500">Paid</span>
              <span className="font-semibold text-slate-900">{formatCurrency(paidSoFar)}</span>
            </div>
            <div>
              <span className="block text-xs text-slate-500">Tips</span>
              <span className="font-semibold text-slate-900">{formatCurrency(tipsSoFar)}</span>
            </div>
          </div>
          {(activeOrder.discountAmount ?? 0) > 0 || (activeOrder.compAmount ?? 0) > 0 ? (
            <p className="mt-2 text-xs text-slate-600">
              Discounts: {formatCurrency((activeOrder.discountAmount ?? 0) + (activeOrder.compAmount ?? 0))}
              {activeOrder.discountReason ? ` (${activeOrder.discountReason})` : ""}
            </p>
          ) : null}
          {nextAction && (
            <p className="mt-3 rounded-lg bg-white px-3 py-2 text-sm font-medium text-orange-800 ring-1 ring-orange-200">
              Next: {nextAction}
            </p>
          )}
        </div>

        {/* Tip needed banner */}
        {showTipPrompt && !isClosed && (
          <div className="rounded-xl border-2 border-purple-300 bg-purple-50 px-4 py-3">
            <p className="font-semibold text-purple-900">Card approved — waiting for tip entry</p>
            <p className="mt-1 text-sm text-purple-700">
              {paymentsNeedingTip.length} card payment{paymentsNeedingTip.length > 1 ? "s" : ""} still need a tip.
            </p>
            <Button className="mt-3" size="sm" onClick={openTipForPending}>
              Add tip now
            </Button>
          </div>
        )}

        {isClosed && (
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4">
            <p className="font-semibold text-slate-800">This check is closed</p>
            <p className="mt-1 text-sm text-slate-600">
              Reopen to add a tip, void a payment, or make other changes.
            </p>
            {canManage && (
              <Button className="mt-3" variant="secondary" disabled={saving} onClick={handleReopen}>
                <Unlock className="h-4 w-4" />
                Reopen Check
              </Button>
            )}
          </div>
        )}

        {/* Payment timeline */}
        {payments.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Payment timeline</p>
            <ul className="space-y-1.5">
              {payments.map((payment) => {
                const needsTip =
                  ["CARD", "DEBIT", "MOBILE"].includes(payment.method) &&
                  payment.tipAmount <= 0;
                return (
                <li
                  key={payment.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm"
                >
                  <span>
                    {PAYMENT_METHOD_LABELS[payment.method]}
                    {payment.reference ? ` · ${payment.reference}` : ""}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">
                      {formatCurrency(payment.amount)}
                      {payment.tipAmount > 0 ? ` + ${formatCurrency(payment.tipAmount)} tip` : ""}
                      <span className="ml-2 text-xs text-emerald-600">
                        {needsTip ? "Needs tip" : "Approved"}
                      </span>
                    </span>
                    {!isClosed && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openTipEditor(payment.id, payment.tipAmount)}
                      >
                        <Pencil className="h-3 w-3" />
                        {needsTip ? "Add tip" : "Edit tip"}
                      </Button>
                    )}
                    {canManage && !isClosed && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleVoidPayment(payment.id)}
                      >
                        <Undo2 className="h-3 w-3" />
                        Void
                      </Button>
                    )}
                  </div>
                </li>
              );
              })}
              <li className="flex justify-between rounded-lg bg-orange-50 px-3 py-2 text-sm font-semibold text-orange-800">
                <span>Remaining</span>
                <span>{formatCurrency(balanceDue)}</span>
              </li>
            </ul>
          </div>
        )}

        {/* Step: Review */}
        {step === "review" && !isClosed && (
          <div className="space-y-4">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Items on check</p>
              <ul className="divide-y rounded-lg border">
                {activeOrder.items.map((item) => (
                  <li key={item.id} className="flex justify-between px-3 py-2 text-sm">
                    <span>
                      {item.quantity}x {item.menuItem.name}
                      {item.seatNumber ? ` — Seat ${item.seatNumber}` : ""}
                    </span>
                    <span className="font-medium">{formatCurrency(item.quantity * item.price)}</span>
                  </li>
                ))}
              </ul>
            </div>

            {checks.length > 0 && (
              <div className="grid gap-3 sm:grid-cols-2">
                {checks.map((check) => (
                  <div key={check.id} className="rounded-lg border bg-slate-50 p-3">
                    <p className="font-medium text-slate-800">{check.label}</p>
                    <p className="text-lg font-bold">{formatCurrency(getCheckItemTotal(check.items))}</p>
                    <ul className="mt-2 space-y-0.5 text-xs text-slate-600">
                      {check.items.map((item) => (
                        <li key={item.id}>
                          {item.menuItem.name} — {formatCurrency(item.quantity * item.price)}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
                {unassignedItems.length > 0 && (
                  <div className="rounded-lg border border-dashed p-3">
                    <p className="font-medium text-slate-600">Unassigned</p>
                    <p className="text-lg font-bold">{formatCurrency(getCheckItemTotal(unassignedItems))}</p>
                  </div>
                )}
              </div>
            )}

            {balanceDue > 0 && (
              <Button className="w-full py-3 text-base" onClick={() => setStep("style")}>
                Looks Good — Take Payment
              </Button>
            )}
          </div>
        )}

        {/* Step: Choose payment style */}
        {step === "style" && balanceDue > 0 && (
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Choose payment style</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => {
                  setPayStyle("full");
                  setStep("pay");
                  setAmount(balanceDue.toFixed(2));
                }}
                className="rounded-xl border-2 border-orange-300 bg-orange-50 p-4 text-left transition hover:bg-orange-100"
              >
                <p className="text-lg font-bold text-orange-800">Pay Full Balance</p>
                <p className="text-sm text-orange-700">{formatCurrency(balanceDue)} — fastest path</p>
              </button>
              <button
                type="button"
                onClick={() => setPanel("split")}
                className="rounded-xl border p-4 text-left transition hover:bg-slate-50"
              >
                <p className="text-lg font-bold text-slate-800">Split Check</p>
                <p className="text-sm text-slate-600">Evenly, by seat, or by item</p>
              </button>
              <button
                type="button"
                onClick={() => {
                  setPayStyle("partial");
                  setStep("pay");
                  setAmount("");
                }}
                className="rounded-xl border p-4 text-left transition hover:bg-slate-50"
              >
                <p className="text-lg font-bold text-slate-800">Custom Amount</p>
                <p className="text-sm text-slate-600">Put $25 on card, rest on cash</p>
              </button>
            </div>
            <Button variant="secondary" onClick={() => setStep("review")}>
              Back to review
            </Button>
          </div>
        )}

        {/* Split panel */}
        {panel === "split" && (
          <div className="space-y-4 rounded-xl border bg-slate-50 p-4">
            <p className="font-semibold text-slate-800">Split check</p>
            {hasPayments && (
              <p className="text-sm text-amber-700">Void payments before changing splits.</p>
            )}
            <div className="flex flex-wrap gap-2">
              {[2, 3, 4].map((n) => (
                <Button
                  key={n}
                  variant="secondary"
                  disabled={saving || hasPayments}
                  onClick={() => {
                    setSplitWays(String(n));
                    handleSplit("even");
                  }}
                >
                  Split {n} ways
                </Button>
              ))}
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min="2"
                  max="12"
                  value={splitWays}
                  onChange={(e) => setSplitWays(e.target.value)}
                  className="w-20"
                />
                <Button
                  variant="secondary"
                  disabled={saving || hasPayments}
                  onClick={() => handleSplit("even")}
                >
                  Custom split
                </Button>
              </div>
              <Button
                variant="secondary"
                disabled={saving || hasPayments}
                onClick={() => handleSplit("seat")}
              >
                Split by seat
              </Button>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="mb-2 text-xs font-semibold uppercase text-slate-500">Original items</p>
                <ul className="max-h-48 space-y-1 overflow-y-auto text-sm">
                  {activeOrder.items.map((item) => (
                    <li key={item.id} className="rounded bg-white px-2 py-1">
                      {item.menuItem.name}
                      {item.seatNumber ? ` — Seat ${item.seatNumber}` : ""} —{" "}
                      {formatCurrency(item.quantity * item.price)}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="mb-2 text-xs font-semibold uppercase text-slate-500">Assign to check</p>
                {activeOrder.items.map((item) => (
                  <div key={item.id} className="mb-2 flex items-center gap-2 text-sm">
                    <span className="flex-1 truncate">{item.menuItem.name}</span>
                    <select
                      className="rounded border px-2 py-1 text-xs"
                      value={itemAssignments[item.id] ?? ""}
                      onChange={(e) =>
                        setItemAssignments((prev) => ({ ...prev, [item.id]: e.target.value }))
                      }
                    >
                      <option value="">Unassigned</option>
                      <option value="check-1">Check 1</option>
                      <option value="check-2">Check 2</option>
                      <option value="check-3">Check 3</option>
                    </select>
                  </div>
                ))}
                <Button
                  size="sm"
                  disabled={saving || hasPayments}
                  onClick={() => handleSplit("item")}
                >
                  Apply item split
                </Button>
              </div>
            </div>
            <Button variant="secondary" onClick={() => setPanel("none")}>
              Done
            </Button>
          </div>
        )}

        {/* Discount panel */}
        {panel === "discount" && canManage && (
          <div className="space-y-3 rounded-xl border bg-slate-50 p-4">
            <p className="font-semibold text-slate-800">Add discount / comp</p>
            {hasPayments && (
              <p className="text-sm text-red-600">
                This check has a payment attached. Void payment before changing the total.
              </p>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField label="Type">
                <select
                  className="w-full rounded-lg border px-3 py-2"
                  value={discountType}
                  onChange={(e) => setDiscountType(e.target.value)}
                >
                  {DISCOUNT_TYPES.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField label="Amount">
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={discountAmount}
                  onChange={(e) => setDiscountAmount(e.target.value)}
                />
              </FormField>
            </div>
            <div className="flex gap-2">
              <Button disabled={saving || hasPayments} onClick={handleDiscount}>
                Apply discount
              </Button>
              <Button variant="secondary" onClick={() => setPanel("none")}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {/* Step: Take payment */}
        {step === "pay" && balanceDue > 0 && (
          <div className="space-y-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {payStyle === "full" ? "Pay full balance" : "Partial payment"} — {PAYMENT_METHODS.find((m) => m.value === method)?.label}
            </p>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {PAYMENT_METHODS.map((option) => {
                const Icon = METHOD_ICONS[option.value];
                const active = method === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setMethod(option.value)}
                    className={cn(
                      "flex items-center gap-2 rounded-lg border px-3 py-3 text-sm font-medium",
                      active ? "border-orange-500 bg-orange-50 text-orange-700" : "border-slate-200 hover:bg-slate-50"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {option.label}
                  </button>
                );
              })}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField label="Payment amount">
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  disabled={payStyle === "full"}
                />
              </FormField>
              <FormField label="Tip">
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={tipAmount}
                  onChange={(e) => setTipAmount(e.target.value)}
                />
              </FormField>
            </div>

            {method === "CASH" && (
              <>
                <FormField label="Cash received">
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={cashTendered}
                    onChange={(e) => setCashTendered(e.target.value)}
                    placeholder="Amount customer handed you"
                  />
                </FormField>
                <div className="flex flex-wrap gap-2">
                  {quickCashAmounts(paymentAmount + tip).map((q) => (
                    <Button
                      key={q}
                      variant="secondary"
                      size="sm"
                      onClick={() => setCashTendered(q.toFixed(2))}
                    >
                      ${q}
                    </Button>
                  ))}
                </div>
                {changePreview != null && tendered > 0 && (
                  <div className="rounded-xl border-2 border-emerald-300 bg-emerald-50 px-4 py-4 text-center">
                    <p className="text-xs uppercase tracking-wide text-emerald-700">Change due</p>
                    <p className="text-4xl font-bold text-emerald-800">{formatCurrency(changePreview)}</p>
                  </div>
                )}
              </>
            )}

            {(method === "CARD" || method === "DEBIT" || method === "MOBILE") && (
              <FormField label="Reference (optional)">
                <Input
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder="Last 4 digits or auth code"
                />
              </FormField>
            )}

            {lastChange != null && lastChange > 0 && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-center text-lg font-bold text-emerald-800">
                Give customer {formatCurrency(lastChange)} in change
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <Button
                disabled={saving || paymentAmount <= 0 || paymentAmount > balanceDue + 0.001}
                onClick={() => handlePay()}
              >
                {saving
                  ? "Processing..."
                  : paymentAmount >= balanceDue - 0.001
                    ? "Complete payment"
                    : "Apply payment"}
              </Button>
              <Button variant="secondary" onClick={() => setStep("style")}>
                Back
              </Button>
            </div>
          </div>
        )}

        {/* Step: Tip entry after card */}
        {step === "tip" && tipTarget && !isClosed && (
          <div className="space-y-4 rounded-xl border-2 border-purple-200 bg-purple-50/50 p-4">
            <div>
              <p className="text-lg font-bold text-purple-900">Add tip</p>
              <p className="text-sm text-purple-700">
                {PAYMENT_METHOD_LABELS[tipTarget.method]} payment of{" "}
                {formatCurrency(tipTarget.amount)}
                {tipTarget.reference ? ` · ${tipTarget.reference}` : ""}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {TIP_PRESETS.map((pct) => {
                const suggested = roundMoney(amountDue * (pct / 100));
                return (
                  <Button
                    key={pct}
                    variant="secondary"
                    onClick={() => setTipAmount(suggested.toFixed(2))}
                  >
                    {pct}% ({formatCurrency(suggested)})
                  </Button>
                );
              })}
              <Button variant="secondary" onClick={() => setTipAmount("0")}>
                No tip
              </Button>
            </div>
            <FormField label="Tip amount">
              <Input
                type="number"
                min="0"
                step="0.01"
                value={tipAmount}
                onChange={(e) => setTipAmount(e.target.value)}
              />
            </FormField>
            <p className="text-xs text-slate-500">Tips calculated on pre-tax subtotal.</p>
            <div className="flex flex-wrap gap-2">
              <Button disabled={saving} onClick={handleSaveTip}>
                {saving ? "Saving..." : "Save tip"}
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  setStep("review");
                  setTipPaymentId(null);
                }}
              >
                Skip for now
              </Button>
            </div>
          </div>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}

        {/* Bottom action bar */}
        {!isClosed ? (
          <div className="sticky bottom-0 -mx-6 -mb-4 border-t bg-white px-6 py-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Quick actions</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Button
                className="h-12"
                disabled={balanceDue <= 0 || saving}
                onClick={() => startFullPay("CARD")}
              >
                <CreditCard className="h-4 w-4" />
                Card
              </Button>
              <Button
                className="h-12"
                variant="secondary"
                disabled={balanceDue <= 0 || saving}
                onClick={() => startFullPay("CASH")}
              >
                <Banknote className="h-4 w-4" />
                Cash
              </Button>
              <Button
                className="h-12"
                variant="secondary"
                disabled={balanceDue <= 0 || saving}
                onClick={() => startPartialPay("GIFT_CARD")}
              >
                <Gift className="h-4 w-4" />
                Gift Card
              </Button>
              <Button
                className="h-12"
                variant="secondary"
                disabled={saving}
                onClick={() => setPanel("split")}
              >
                <Split className="h-4 w-4" />
                Split
              </Button>
              {showTipPrompt && (
                <Button className="h-12" disabled={saving} onClick={openTipForPending}>
                  <Pencil className="h-4 w-4" />
                  Add Tip
                </Button>
              )}
              {canManage && (
                <Button
                  className="h-12"
                  variant="secondary"
                  disabled={saving}
                  onClick={() => setPanel("discount")}
                >
                  <Percent className="h-4 w-4" />
                  Discount
                </Button>
              )}
              <Button className="h-12" variant="secondary" disabled>
                <Receipt className="h-4 w-4" />
                Receipt
              </Button>
              <Button
                className="h-12"
                disabled={!canClose || saving}
                onClick={() => handleClose()}
              >
                <Lock className="h-4 w-4" />
                {canClose
                  ? needsTipEntry(payments)
                    ? "Close Check (no tip)"
                    : "Close Check"
                  : `Cannot Close — ${formatCurrency(balanceDue)} Remaining`}
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
