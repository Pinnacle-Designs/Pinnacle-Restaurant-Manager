import type { AppRole } from "./app-role";
import type { PlanId } from "./plans";
import { filterNavForPlan } from "./plans";

export type Permission =
  | "manage_permissions"
  | "view_finances"
  | "view_salaries"
  | "view_insights"
  | "view_receipts"
  | "edit_staff"
  | "manage_schedule"
  | "manage_payroll"
  | "request_ewa"
  | "view_own_schedule"
  | "clock_in"
  | "approve_shift_swaps"
  | "manage_hiring"
  | "manage_training"
  | "complete_training"
  | "manage_compliance"
  | "manage_retention"
  | "manage_orders"
  | "manage_menu"
  | "manage_inventory"
  | "manage_tables"
  | "manage_social"
  | "view_analytics"
  | "place_orders"
  | "add_to_check";

export const ALL_PERMISSIONS: Permission[] = [
  "manage_permissions",
  "view_finances",
  "view_salaries",
  "view_insights",
  "view_receipts",
  "edit_staff",
  "manage_schedule",
  "manage_payroll",
  "request_ewa",
  "view_own_schedule",
  "clock_in",
  "approve_shift_swaps",
  "manage_hiring",
  "manage_training",
  "complete_training",
  "manage_compliance",
  "manage_retention",
  "manage_orders",
  "manage_menu",
  "manage_inventory",
  "manage_tables",
  "manage_social",
  "view_analytics",
  "place_orders",
  "add_to_check",
];

export function isValidPermission(value: unknown): value is Permission {
  return typeof value === "string" && ALL_PERMISSIONS.includes(value as Permission);
}

export const PERMISSION_LABELS: Record<Permission, string> = {
  manage_permissions: "Manage team access",
  view_finances: "View finances",
  view_salaries: "View salaries",
  view_insights: "Command Center",
  view_receipts: "View receipts",
  edit_staff: "Edit staff roster",
  manage_schedule: "Manage schedules",
  manage_payroll: "Manage payroll & tips",
  request_ewa: "Request earned wage access",
  view_own_schedule: "View own schedule",
  clock_in: "Clock in & out",
  approve_shift_swaps: "Approve shift swaps",
  manage_hiring: "Manage hiring & ATS",
  manage_training: "Manage training & certifications",
  complete_training: "Complete compliance training",
  manage_compliance: "Labor law & compliance",
  manage_retention: "Retention & performance feedback",
  manage_orders: "Manage orders",
  manage_menu: "Manage menu",
  manage_inventory: "Manage inventory",
  manage_tables: "Manage tables",
  manage_social: "Manage social",
  view_analytics: "View analytics",
  place_orders: "Place orders",
  add_to_check: "Add items to checks",
};

export const PERMISSION_GROUPS: { label: string; permissions: Permission[] }[] = [
  {
    label: "Administration",
    permissions: ["manage_permissions", "edit_staff", "manage_schedule", "manage_payroll", "approve_shift_swaps", "manage_hiring", "manage_training", "manage_compliance", "manage_retention"],
  },
  {
    label: "Financial",
    permissions: ["view_finances", "view_salaries", "view_receipts", "view_analytics", "manage_payroll"],
  },
  {
    label: "Operations",
    permissions: [
      "manage_orders",
      "manage_menu",
      "manage_inventory",
      "manage_tables",
      "place_orders",
      "add_to_check",
    ],
  },
  {
    label: "Growth & insights",
    permissions: ["view_insights", "manage_social"],
  },
];

export const DEFAULT_ROLE_PERMISSIONS: Record<AppRole, Permission[]> = {
  OWNER: [...ALL_PERMISSIONS],
  MANAGER: [
    "manage_permissions",
    "view_finances",
    "view_salaries",
    "view_insights",
    "view_receipts",
    "edit_staff",
    "manage_schedule",
    "manage_payroll",
    "approve_shift_swaps",
    "manage_hiring",
    "manage_training",
    "complete_training",
    "manage_compliance",
    "manage_retention",
    "view_own_schedule",
    "clock_in",
    "manage_orders",
    "manage_menu",
    "manage_inventory",
    "manage_tables",
    "manage_social",
    "view_analytics",
    "place_orders",
    "add_to_check",
  ],
  SERVER: ["place_orders", "add_to_check", "request_ewa", "view_own_schedule", "clock_in", "complete_training"],
  KITCHEN: ["place_orders", "add_to_check", "request_ewa", "view_own_schedule", "clock_in", "complete_training"],
  HOST: ["place_orders", "add_to_check", "request_ewa", "view_own_schedule", "clock_in", "complete_training"],
};

const NAV_PERMISSION_MAP: Record<string, Permission> = {
  "/finances": "view_finances",
  "/insights": "view_insights",
  "/social": "manage_social",
  "/analytics": "view_analytics",
  "/staff": "edit_staff",
  "/timeclock": "clock_in",
  "/menu": "manage_menu",
  "/inventory": "manage_inventory",
  "/tables": "manage_tables",
  "/orders": "place_orders",
};

const ROUTE_PERMISSION_MAP: Record<string, Permission> = {
  "/finances": "view_finances",
  "/insights": "view_insights",
  "/social": "manage_social",
  "/analytics": "view_analytics",
  "/api/social": "manage_social",
  "/api/analytics": "view_analytics",
  "/api/expenses": "view_finances",
  "/api/insights": "view_insights",
  "/api/ai": "view_insights",
  "/api/receipts": "view_receipts",
  "/api/permissions": "manage_permissions",
  "/api/payroll": "manage_payroll",
  "/api/hiring": "manage_hiring",
  "/api/training": "manage_training",
  "/api/training/my": "complete_training",
  "/api/training/modules": "complete_training",
  "/api/compliance": "manage_compliance",
  "/api/retention": "manage_retention",
  "/api/timeclock": "clock_in",
  "/api/shift-swaps": "view_own_schedule",
};

function routeBase(pathname: string): string {
  if (pathname.startsWith("/api/training/my")) return "/api/training/my";
  if (pathname.startsWith("/api/training/modules")) return "/api/training/modules";
  if (pathname.startsWith("/api/compliance/audit-records")) return "/api/compliance";
  if (pathname.startsWith("/api/compliance/incidents")) return "/api/compliance";
  if (pathname.startsWith("/api/compliance")) return "/api/compliance";
  if (pathname.startsWith("/api/retention/feedback")) return "/api/retention";
  if (pathname.startsWith("/api/retention")) return "/api/retention";
  if (pathname.startsWith("/api/")) {
    const parts = pathname.split("/").filter(Boolean);
    return parts.length >= 2 ? `/${parts[0]}/${parts[1]}` : pathname;
  }
  return "/" + (pathname.split("/").filter(Boolean)[0] ?? "");
}

export function isManagement(role: AppRole): boolean {
  return role === "OWNER" || role === "MANAGER";
}

export function hasPermission(role: AppRole, permission: Permission): boolean {
  return DEFAULT_ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

export function hasPermissionInList(
  permissions: Permission[] | null | undefined,
  permission: Permission
): boolean {
  if (permissions?.length) return permissions.includes(permission);
  return false;
}

export function canAccessRoute(
  role: AppRole,
  pathname: string,
  permissions?: Permission[] | null
): boolean {
  if (permissions?.length) {
    return canAccessRouteWithPermissions(permissions, pathname);
  }

  if (role === "OWNER" || role === "MANAGER") return true;
  const base = routeBase(pathname);
  const required = ROUTE_PERMISSION_MAP[base] ?? ROUTE_PERMISSION_MAP[pathname];
  if (required) return false;
  return true;
}

export function canAccessRouteWithPermissions(
  permissions: Permission[],
  pathname: string
): boolean {
  const base = routeBase(pathname);
  const required = ROUTE_PERMISSION_MAP[base] ?? ROUTE_PERMISSION_MAP[pathname];
  if (!required) return true;
  return permissions.includes(required);
}

export const ROLE_LABELS: Record<AppRole, string> = {
  OWNER: "Owner",
  MANAGER: "Manager",
  SERVER: "Server",
  KITCHEN: "Kitchen",
  HOST: "Host",
};

export const ROLE_COLORS: Record<AppRole, string> = {
  OWNER: "bg-purple-100 text-purple-800",
  MANAGER: "bg-blue-100 text-blue-800",
  SERVER: "bg-green-100 text-green-800",
  KITCHEN: "bg-orange-100 text-orange-800",
  HOST: "bg-pink-100 text-pink-800",
};

export function filterNavForPermissions<T extends { href: string }>(
  permissions: Permission[],
  items: readonly T[]
): T[] {
  return items.filter((item) => {
    const required = NAV_PERMISSION_MAP[item.href];
    return !required || permissions.includes(required);
  });
}

export function filterNavForRole(
  role: AppRole,
  items: readonly { href: string; label: string; icon: string }[],
  permissions?: Permission[] | null
) {
  if (permissions?.length) {
    return filterNavForPermissions(permissions, items);
  }
  if (role === "OWNER" || role === "MANAGER") return items;
  const hidden = new Set(["/finances", "/insights", "/social", "/analytics"]);
  return items.filter((item) => !hidden.has(item.href));
}

export function filterNavForUser(
  role: AppRole,
  plan: PlanId | null | undefined,
  items: readonly { href: string; label: string; icon: string }[],
  permissions?: Permission[] | null
) {
  return filterNavForPlan(plan, filterNavForRole(role, items, permissions));
}
