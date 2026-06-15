import type { CheckStatus, PaymentMethod } from "@prisma/client";

export type OrderTotalsInput = {
  totalAmount: number;
  discountAmount?: number | null;
  compAmount?: number | null;
  voidAmount?: number | null;
};

export type OrderPaymentInput = {
  amount: number;
  tipAmount?: number | null;
  method?: PaymentMethod;
  checkId?: string | null;
};

export type OrderItemInput = {
  quantity: number;
  price: number;
  checkId?: string | null;
};

export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export function getOrderAmountDue(order: OrderTotalsInput): number {
  const due =
    order.totalAmount -
    (order.discountAmount ?? 0) -
    (order.compAmount ?? 0) -
    (order.voidAmount ?? 0);
  return Math.max(0, roundMoney(due));
}

export function getPaymentsTotal(payments: OrderPaymentInput[]): number {
  return roundMoney(payments.reduce((sum, payment) => sum + payment.amount, 0));
}

export function getTipsTotal(payments: OrderPaymentInput[]): number {
  return roundMoney(payments.reduce((sum, payment) => sum + (payment.tipAmount ?? 0), 0));
}

export function getOrderBalanceDue(
  order: OrderTotalsInput,
  payments: OrderPaymentInput[]
): number {
  return Math.max(0, roundMoney(getOrderAmountDue(order) - getPaymentsTotal(payments)));
}

export function getItemLineTotal(item: OrderItemInput): number {
  return roundMoney(item.quantity * item.price);
}

export function getCheckItemTotal(items: OrderItemInput[]): number {
  return roundMoney(items.reduce((sum, item) => sum + getItemLineTotal(item), 0));
}

export function hasPaymentsAttached(payments: OrderPaymentInput[] | undefined): boolean {
  return (payments?.length ?? 0) > 0;
}

export function needsTipEntry(payments: OrderPaymentInput[]): boolean {
  return getPaymentsNeedingTip(payments).length > 0;
}

export function getPaymentsNeedingTip(
  payments: Array<OrderPaymentInput & { id?: string; method?: PaymentMethod }>
) {
  return payments.filter(
    (p) =>
      p.id &&
      ["CARD", "DEBIT", "MOBILE"].includes(p.method ?? "") &&
      (p.tipAmount ?? 0) <= 0
  );
}

export function findTippablePayment(
  payments: Array<{ id: string; method: PaymentMethod; tipAmount: number }>,
  preferNeedsTip = true
) {
  const cardPayments = payments.filter((p) =>
    ["CARD", "DEBIT", "MOBILE"].includes(p.method)
  );
  if (preferNeedsTip) {
    const pending = cardPayments.filter((p) => p.tipAmount <= 0);
    if (pending.length > 0) return pending[pending.length - 1];
  }
  return cardPayments[cardPayments.length - 1];
}

export function deriveCheckStatus(input: {
  checkStatus?: CheckStatus | null;
  balanceDue: number;
  payments: OrderPaymentInput[];
  printedAt?: Date | string | null;
}): CheckStatus {
  const { balanceDue, payments, printedAt } = input;
  if (input.checkStatus === "CLOSED") return "CLOSED";
  if (input.checkStatus === "REFUND_VOID_NEEDED") return "REFUND_VOID_NEEDED";

  if (balanceDue <= 0) {
    if (needsTipEntry(payments)) return "NEEDS_TIP";
    return "PAID";
  }
  if (payments.length > 0) return "PARTIALLY_PAID";
  if (printedAt) return "PRINTED";
  return "OPEN";
}

export const CHECK_STATUS_LABELS: Record<CheckStatus, string> = {
  OPEN: "Open",
  PRINTED: "Printed",
  PARTIALLY_PAID: "Partially Paid",
  PAID: "Paid",
  CLOSED: "Closed",
  NEEDS_TIP: "Needs Tip Entry",
  REFUND_VOID_NEEDED: "Refund / Void Needed",
};

export const CHECK_STATUS_COLORS: Record<CheckStatus, string> = {
  OPEN: "bg-blue-100 text-blue-800",
  PRINTED: "bg-slate-100 text-slate-700",
  PARTIALLY_PAID: "bg-amber-100 text-amber-800",
  PAID: "bg-green-100 text-green-800",
  CLOSED: "bg-gray-100 text-gray-800",
  NEEDS_TIP: "bg-purple-100 text-purple-800",
  REFUND_VOID_NEEDED: "bg-red-100 text-red-800",
};

export const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "CASH", label: "Cash" },
  { value: "CARD", label: "Credit Card" },
  { value: "DEBIT", label: "Debit Card" },
  { value: "MOBILE", label: "Mobile Pay" },
  { value: "GIFT_CARD", label: "Gift Card" },
  { value: "OTHER", label: "Other" },
];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: "Cash",
  CARD: "Credit Card",
  DEBIT: "Debit Card",
  MOBILE: "Mobile Pay",
  GIFT_CARD: "Gift Card",
  OTHER: "Other",
};

export const DISCOUNT_TYPES = [
  { id: "MANAGER_COMP", label: "Manager Comp", field: "compAmount" as const },
  { id: "EMPLOYEE_MEAL", label: "Employee Meal", field: "compAmount" as const },
  { id: "COUPON", label: "Coupon / Promo", field: "discountAmount" as const },
  { id: "GUEST_RECOVERY", label: "Guest Recovery", field: "discountAmount" as const },
  { id: "LOYALTY", label: "Loyalty Reward", field: "discountAmount" as const },
];

export const ORDER_STATUSES = [
  "PENDING",
  "PREPARING",
  "READY",
  "SERVED",
  "PAID",
  "CANCELLED",
] as const;

export type OrderStatusValue = (typeof ORDER_STATUSES)[number];

export const ORDER_INCLUDE = {
  table: true,
  items: {
    include: { menuItem: true, kitchenStation: true },
    orderBy: { id: "asc" as const },
  },
  payments: { orderBy: { createdAt: "asc" as const } },
  checks: {
    include: {
      items: { include: { menuItem: true } },
      payments: { orderBy: { createdAt: "asc" as const } },
    },
    orderBy: { createdAt: "asc" as const },
  },
};
