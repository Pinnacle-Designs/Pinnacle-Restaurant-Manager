export type ServeStep = "fire" | "ready" | "served" | "pay";

export const SERVE_STEPS: ServeStep[] = ["fire", "ready", "served", "pay"];

export type ServeStepState = "hidden" | "upcoming" | "active" | "complete";

type OrderForServe = {
  status: string;
  items: { kitchenStatus?: string | null; routesToKitchen?: boolean }[];
};

export function pendingFireCount(order: OrderForServe | null | undefined): number {
  if (!order?.items.length) return 0;
  return order.items.filter(
    (line) => line.routesToKitchen !== false && line.kitchenStatus === "PENDING"
  ).length;
}

export function pendingFireCountByCourse(
  order: OrderForServe | null | undefined,
  course: string
): number {
  if (!order?.items.length) return 0;
  return order.items.filter(
    (line) =>
      line.routesToKitchen !== false &&
      line.kitchenStatus === "PENDING" &&
      (line as { course?: string }).course === course
  ).length;
}

export function allItemsFired(order: OrderForServe | null | undefined): boolean {
  if (!order?.items.length) return false;
  return pendingFireCount(order) === 0;
}

/** Next actionable step (legacy helper) */
export function getServeStep(order: OrderForServe | null | undefined): ServeStep | null {
  const states = getServeStepStates(order);
  const active = SERVE_STEPS.find((step) => states[step] === "active");
  return active ?? null;
}

/** Visual + interaction state for every step in the serve flow */
export function getServeStepStates(
  order: OrderForServe | null | undefined
): Record<ServeStep, ServeStepState> {
  const hidden: Record<ServeStep, ServeStepState> = {
    fire: "hidden",
    ready: "hidden",
    served: "hidden",
    pay: "hidden",
  };
  if (!order?.items.length) return hidden;

  const pending = pendingFireCount(order);
  const status = order.status;

  if (pending > 0) {
    return {
      fire: "active",
      ready: "upcoming",
      served: "upcoming",
      pay: "upcoming",
    };
  }

  if (status === "PENDING" || status === "PREPARING") {
    return {
      fire: "complete",
      ready: "active",
      served: "upcoming",
      pay: "upcoming",
    };
  }

  if (status === "READY") {
    return {
      fire: "complete",
      ready: "complete",
      served: "active",
      pay: "upcoming",
    };
  }

  if (status === "SERVED") {
    return {
      fire: "complete",
      ready: "complete",
      served: "complete",
      pay: "active",
    };
  }

  return {
    fire: "complete",
    ready: "complete",
    served: "complete",
    pay: status === "PAID" ? "complete" : "hidden",
  };
}

export function serveStepLabel(step: ServeStep, pendingCount: number): string {
  switch (step) {
    case "fire":
      return pendingCount > 0 ? `Fire pending (${pendingCount})` : "Fired to kitchen";
    case "ready":
      return "Ready to serve";
    case "served":
      return "Mark served";
    case "pay":
      return "Pay";
  }
}
