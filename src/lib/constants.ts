export const PHOTO_CATEGORIES = [
  { value: "MENU_ITEM", label: "Menu Items", icon: "utensils", color: "bg-orange-100 text-orange-700" },
  { value: "INVENTORY", label: "Inventory", icon: "package", color: "bg-blue-100 text-blue-700" },
  { value: "STAFF", label: "Staff", icon: "users", color: "bg-purple-100 text-purple-700" },
  { value: "FACILITY", label: "Facility", icon: "building", color: "bg-gray-100 text-gray-700" },
  { value: "RECEIPT", label: "Receipts", icon: "receipt", color: "bg-green-100 text-green-700" },
  { value: "VENDOR_INVOICE", label: "Vendor Invoices", icon: "file-text", color: "bg-amber-100 text-amber-800" },
  { value: "FOOD_PREP", label: "Food Prep", icon: "chef-hat", color: "bg-red-100 text-red-700" },
  { value: "MARKETING", label: "Marketing", icon: "megaphone", color: "bg-pink-100 text-pink-700" },
  { value: "MAINTENANCE", label: "Maintenance", icon: "wrench", color: "bg-yellow-100 text-yellow-700" },
  { value: "OTHER", label: "Other", icon: "image", color: "bg-slate-100 text-slate-700" },
] as const;

export const INSIGHT_SEVERITY_COLORS = {
  LOW: "bg-slate-100 text-slate-700 border-slate-200",
  MEDIUM: "bg-amber-100 text-amber-800 border-amber-200",
  HIGH: "bg-orange-100 text-orange-800 border-orange-200",
  CRITICAL: "bg-red-100 text-red-800 border-red-200",
} as const;

export const ORDER_STATUS_COLORS = {
  PENDING: "bg-yellow-100 text-yellow-800",
  PREPARING: "bg-blue-100 text-blue-800",
  READY: "bg-green-100 text-green-800",
  SERVED: "bg-purple-100 text-purple-800",
  PAID: "bg-gray-100 text-gray-800",
  CANCELLED: "bg-red-100 text-red-800",
} as const;

export const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: "layout-dashboard" },
  { href: "/photos", label: "Photos", icon: "camera" },
  { href: "/menu", label: "Menu", icon: "utensils" },
  { href: "/kitchen", label: "Kitchen", icon: "soup" },
  { href: "/boh", label: "BOH", icon: "chef-hat" },
  { href: "/kds", label: "KDS", icon: "chef-hat" },
  { href: "/inventory", label: "Inventory", icon: "package" },
  { href: "/purchase-orders", label: "Purchase Orders", icon: "truck" },
  { href: "/staff", label: "Staff", icon: "users" },
  { href: "/log-book", label: "Log Book", icon: "book-open" },
  { href: "/timeclock", label: "Time Clock", icon: "clock" },
  { href: "/orders", label: "Orders", icon: "zap" },
  { href: "/tables", label: "Tables", icon: "layout-grid" },
  { href: "/finances", label: "Finances", icon: "dollar-sign" },
  { href: "/analytics", label: "Analytics", icon: "bar-chart-3" },
  { href: "/reports", label: "Reports", icon: "file-text" },
  { href: "/back-office", label: "Back Office", icon: "pie-chart" },
  { href: "/crystal-ball", label: "Crystal Ball", icon: "sparkles" },
  { href: "/social", label: "Social", icon: "share-2" },
  { href: "/insights", label: "Command Center", icon: "brain" },
] as const;

/** Sidebar navigation groups — collapsible sections in the nav. */
export const NAV_GROUPS = [
  {
    id: "overview",
    label: "Overview",
    hrefs: ["/dashboard", "/photos", "/analytics", "/reports", "/insights"],
  },
  {
    id: "service",
    label: "Front of house",
    hrefs: ["/orders", "/tables", "/timeclock"],
  },
  {
    id: "menu-kitchen",
    label: "Menu & kitchen",
    hrefs: ["/menu", "/kitchen", "/boh", "/kds"],
  },
  {
    id: "inventory",
    label: "Inventory",
    hrefs: ["/inventory", "/purchase-orders"],
  },
  {
    id: "team",
    label: "Team",
    hrefs: ["/staff", "/log-book"],
  },
  {
    id: "business",
    label: "Business",
    hrefs: ["/finances", "/back-office", "/crystal-ball", "/social"],
  },
] as const;

/** Bottom bar tabs on mobile — remaining items go in the More sheet */
export const MOBILE_PRIMARY_NAV_HREFS = [
  "/dashboard",
  "/orders",
  "/timeclock",
  "/insights",
  "/inventory",
  "/analytics",
] as const;
