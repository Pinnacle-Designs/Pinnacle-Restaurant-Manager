export interface PageSearchConfig {
  placeholder: string;
  hint?: string;
}

/** Per-route page search config — pathname prefix match. */
const PAGE_SEARCH: Record<string, PageSearchConfig> = {
  "/dashboard": { placeholder: "Search dashboard widgets…", hint: "Filter quick links" },
  "/photos": { placeholder: "Search photos by title or category…" },
  "/menu": { placeholder: "Search menu items, categories, stations…" },
  "/kitchen": { placeholder: "Search recipes, prep items…" },
  "/boh": { placeholder: "Search BOH menu items…" },
  "/kds": { placeholder: "Search tickets by item or table…" },
  "/inventory": { placeholder: "Search items, barcodes, suppliers, zones…" },
  "/purchase-orders": { placeholder: "Search POs, vendors, invoices, dates…" },
  "/staff": { placeholder: "Search staff, roles, schedules…" },
  "/timeclock": { placeholder: "Search employees by name or role…" },
  "/orders": { placeholder: "Search checks, tables, servers…" },
  "/tables": { placeholder: "Search tables, sections, reservations…" },
  "/finances": { placeholder: "Search expenses, categories…" },
  "/analytics": { placeholder: "Search metrics and sections…" },
  "/reports": { placeholder: "Search report types and templates…" },
  "/back-office": { placeholder: "Search variance lines, waste logs…" },
  "/crystal-ball": { placeholder: "Search forecasts and scenarios…" },
  "/social": { placeholder: "Search posts and accounts…" },
  "/insights": { placeholder: "Search prompts and insights…" },
  "/account": { placeholder: "Search settings…" },
  "/admin": { placeholder: "Search users and locations…" },
};

/** Routes with dedicated search UI — skip the global page strip. */
const SKIP_PAGE_STRIP = new Set(["/log-book"]);

export function getPageSearchConfig(pathname: string): PageSearchConfig | null {
  if (SKIP_PAGE_STRIP.has(pathname)) return null;
  for (const [prefix, config] of Object.entries(PAGE_SEARCH)) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) return config;
  }
  return { placeholder: "Search this page…" };
}
