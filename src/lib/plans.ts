import type { SubscriptionPlan } from "@prisma/client";

export type PlanId = SubscriptionPlan;

export interface PlanDefinition {
  id: PlanId;
  name: string;
  price: number;
  period: string;
  bestFor: string;
  blurb: string;
  features: string[];
  maxUsers: number;
  routes: string[];
  featured?: boolean;
}

const STARTER_ROUTES = [
  "/dashboard",
  "/account",
  "/onboarding",
  "/admin",
  "/photos",
  "/menu",
  "/kitchen",
  "/inventory",
  "/walk-in",
  "/staff",
  "/tables",
  "/orders",
  "/pos",
  "/insights",
  "/analytics",
];

const GROWTH_ROUTES = [...STARTER_ROUTES, "/finances", "/loading-dock"];

const PRO_ROUTES = [...GROWTH_ROUTES, "/social"];

export const PLANS: PlanDefinition[] = [
  {
    id: "STARTER",
    name: "Starter",
    price: 49,
    period: "/mo per location",
    bestFor: "Small diners, food trucks, cafes",
    blurb: "Everything you need to run one location day to day.",
    features: [
      "Dashboard & orders",
      "Menu management",
      "Kitchen — recipe costing, yield & prep lists",
      "Basic inventory",
      "Walk-In mobile counts & FIFO",
      "Staff & roles",
      "Basic analytics",
      "Table floor plan",
      "AI questions (limited)",
    ],
    maxUsers: 3,
    routes: STARTER_ROUTES,
  },
  {
    id: "GROWTH",
    name: "Growth",
    price: 149,
    period: "/mo per location",
    bestFor: "Most independent restaurants",
    blurb: "Deep enough to run profit like a pro.",
    features: [
      "Everything in Starter",
      "Full inventory & vendor pricing",
      "Loading Dock — PO matching & invoice OCR",
      "Recipe costing & food cost",
      "Staff scheduling & labor analytics",
      "Receipt OCR (limited)",
      "AI Command Center (standard)",
      "Most analytics modules",
    ],
    maxUsers: 10,
    routes: GROWTH_ROUTES,
    featured: true,
  },
  {
    id: "PRO",
    name: "Pro",
    price: 299,
    period: "/mo per location",
    bestFor: "Owners serious about profit",
    blurb: "The full restaurant brain.",
    features: [
      "Everything in Growth",
      "Full 12-tab analytics suite",
      "Advanced AI Command Center",
      "Profit by item, shift & channel",
      "Marketing ROI & guest experience",
      "Photo intelligence",
      "Unlimited receipt scans",
    ],
    maxUsers: 25,
    routes: PRO_ROUTES,
  },
];

export const PLAN_BY_ID = Object.fromEntries(PLANS.map((p) => [p.id, p])) as Record<
  PlanId,
  PlanDefinition
>;

export function parsePlanId(raw: unknown): PlanId | null {
  const value = String(raw || "").trim().toUpperCase();
  if (value === "STARTER" || value === "GROWTH" || value === "PRO") return value;
  return null;
}

export function planRouteSet(plan: PlanId): Set<string> {
  return new Set(PLAN_BY_ID[plan]?.routes ?? STARTER_ROUTES);
}

export function canAccessPlanRoute(plan: PlanId | null | undefined, pathname: string): boolean {
  const effective = plan ?? "STARTER";
  const routes = planRouteSet(effective);
  const base = "/" + pathname.split("/").filter(Boolean)[0];
  return routes.has(base);
}

export function filterNavForPlan<T extends { href: string }>(
  plan: PlanId | null | undefined,
  items: readonly T[]
): T[] {
  const routes = planRouteSet(plan ?? "STARTER");
  return items.filter((item) => routes.has(item.href));
}

export function requiredPlanForRoute(pathname: string): PlanId | null {
  const base = "/" + pathname.split("/").filter(Boolean)[0];
  if (STARTER_ROUTES.includes(base)) return null;
  if (PRO_ROUTES.includes(base) && !GROWTH_ROUTES.includes(base)) return "PRO";
  if (GROWTH_ROUTES.includes(base)) return "GROWTH";
  return "STARTER";
}
