import type { AppRole } from "@prisma/client";

export type Permission =
  | "view_finances"
  | "view_salaries"
  | "view_insights"
  | "view_receipts"
  | "edit_staff"
  | "manage_schedule"
  | "manage_orders"
  | "manage_menu"
  | "manage_inventory"
  | "manage_tables"
  | "manage_social"
  | "view_analytics"
  | "place_orders"
  | "add_to_check";

const MANAGEMENT: AppRole[] = ["OWNER", "MANAGER"];

const ROLE_PERMISSIONS: Record<AppRole, Permission[]> = {
  OWNER: [
    "view_finances",
    "view_salaries",
    "view_insights",
    "view_receipts",
    "edit_staff",
    "manage_schedule",
    "manage_orders",
    "manage_menu",
    "manage_inventory",
    "manage_tables",
    "manage_social",
    "view_analytics",
    "place_orders",
    "add_to_check",
  ],
  MANAGER: [
    "view_finances",
    "view_salaries",
    "view_insights",
    "view_receipts",
    "edit_staff",
    "manage_schedule",
    "manage_orders",
    "manage_menu",
    "manage_inventory",
    "manage_tables",
    "manage_social",
    "view_analytics",
    "place_orders",
    "add_to_check",
  ],
  SERVER: ["place_orders", "add_to_check"],
  KITCHEN: ["place_orders", "add_to_check"],
  HOST: ["place_orders", "add_to_check"],
};

export function isManagement(role: AppRole): boolean {
  return MANAGEMENT.includes(role);
}

export function hasPermission(role: AppRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
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

/** Routes restricted to owner/manager only */
export const MANAGEMENT_ROUTES = [
  "/finances",
  "/insights",
  "/social",
  "/analytics",
  "/api/social",
  "/api/analytics",
  "/api/expenses",
  "/api/insights",
  "/api/ai",
  "/api/receipts",
];

export function canAccessRoute(role: AppRole, pathname: string): boolean {
  if (isManagement(role)) return true;
  if (MANAGEMENT_ROUTES.some((r) => pathname.startsWith(r))) return false;
  if (pathname.startsWith("/staff")) return true; // view-only for staff roles
  return true;
}

export function filterNavForRole(
  role: AppRole,
  items: readonly { href: string; label: string; icon: string }[]
) {
  if (isManagement(role)) return items;

  const hidden = new Set(["/finances", "/insights", "/social", "/analytics"]);
  return items.filter((item) => !hidden.has(item.href));
}
