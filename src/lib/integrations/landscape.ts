import raw from "@/lib/integrations/landscape-data.json";
import { getNativeConnector, type ConnectorStatus, type ConnectAction } from "@/lib/integrations/native-connectors";

export type ApiTier = "public" | "partner" | "limited" | "unknown";

export type IntegrationMode =
  | "native_live"
  | "native_planned"
  | "partner_api"
  | "csv_bridge"
  | "webhook_bridge"
  | "manual";

export interface LandscapeSystem {
  id: string;
  category: string;
  name: string;
  functions: string;
  apiStatus: string;
  accessType: string;
  notes: string;
  sourceUrl: string | null;
  apiTier: ApiTier;
  integrationMode: IntegrationMode;
  connectorStatus?: ConnectorStatus;
  connectAction?: ConnectAction;
  pinnacleArea?: string;
  featureRoute?: string;
}

export interface LandscapeCategory {
  category: string;
  systemsCount: number;
  publicApiCount: number;
  partnerEnterpriseCount: number;
  limitedCount: number;
  pinnacleUse: string;
}

export interface IntegrationPriority {
  priority: number;
  name: string;
  category: string;
  why: string;
  apiPath: string;
  difficulty: string;
  mvp: string;
}

export interface FunctionMapEntry {
  function: string;
  tracks: string;
  categories: string;
  pinnacleFeature: string;
}

/** In-app destination for each business function area. */
export const FUNCTION_ROUTES: Record<string, string> = {
  Sales: "/analytics",
  Labor: "/staff?tab=schedule",
  Inventory: "/inventory",
  Ordering: "/purchase-orders",
  Menu: "/menu",
  Kitchen: "/kitchen",
  Guests: "/tables",
  Marketing: "/social",
  Compliance: "/log-book",
  Accounting: "/finances",
  Reporting: "/reports",
};

/** Default Pinnacle screen per spreadsheet category. */
export const CATEGORY_ROUTES: Record<string, string> = {
  "POS / Core Restaurant Operating Systems": "/orders",
  "Online Ordering / Direct Ordering": "/orders",
  "Third-Party Delivery Marketplaces": "/analytics",
  "Delivery Aggregators / Order Injection": "/analytics",
  "Reservations / Waitlist / Table Management": "/tables",
  "Inventory / Food Cost / Recipe Costing": "/inventory",
  "Accounting / Back Office / AP Automation": "/finances",
  "Scheduling / Labor / Time Clock": "/staff?tab=schedule",
  "Payroll / HR / Hiring / Onboarding": "/staff?tab=payroll",
  "Kitchen Display Systems / Expo / Production": "/kitchen",
  "Payments / Merchant Services": "/account?tab=billing",
  "Loyalty / CRM / Gift Cards / Guest Data": "/analytics",
  "Marketing / Website / Reputation / Social": "/social",
  "Reporting / Analytics / Business Intelligence": "/reports",
  "AI / Automation / Voice / Phone Ordering": "/insights",
  "Kiosks / Self-Ordering / QR Ordering": "/tableside",
  "Digital Menu Boards / Menu Management": "/menu",
  "Procurement / Supplier Ordering": "/purchase-orders",
  "Automation / Integration Platforms": "/account?tab=integrations",
  "Bar / Beverage-Specific Systems": "/inventory?tab=count",
  "Catering / Events / Banquets": "/orders",
  "Customer Feedback / Surveys / Mystery Shop": "/staff?tab=retention",
  "Maintenance / Facilities / Equipment": "/log-book",
  "Security / Cameras / Loss Prevention": "/analytics",
  "Task Management / Checklists / Food Safety": "/log-book",
  "Training / LMS / SOPs": "/staff?tab=training",
};

function resolveIntegrationMode(
  apiTier: ApiTier,
  connectorStatus?: ConnectorStatus
): IntegrationMode {
  if (connectorStatus === "live" || connectorStatus === "beta") return "native_live";
  if (connectorStatus === "planned") return "native_planned";
  if (apiTier === "public") return "partner_api";
  if (apiTier === "partner") return "partner_api";
  return "manual";
}

function enrichSystem(system: (typeof raw.systems)[number]): LandscapeSystem {
  const connector = getNativeConnector(system.id);
  const integrationMode = resolveIntegrationMode(
    system.apiTier as ApiTier,
    connector?.status
  );

  return {
    ...system,
    apiTier: system.apiTier as ApiTier,
    sourceUrl: system.sourceUrl || null,
    integrationMode,
    connectorStatus: connector?.status,
    connectAction: connector?.connect,
    pinnacleArea: connector?.pinnacleArea,
    featureRoute: CATEGORY_ROUTES[system.category] ?? "/dashboard",
  };
}

export const INTEGRATION_LANDSCAPE = {
  systems: raw.systems.map(enrichSystem),
  categories: raw.categories as LandscapeCategory[],
  priorities: raw.priorities as IntegrationPriority[],
  functions: raw.functions as FunctionMapEntry[],
};

export function searchLandscapeSystems(query: string, category?: string, apiTier?: ApiTier) {
  const q = query.trim().toLowerCase();
  return INTEGRATION_LANDSCAPE.systems.filter((s) => {
    if (category && s.category !== category) return false;
    if (apiTier && s.apiTier !== apiTier) return false;
    if (!q) return true;
    return (
      s.name.toLowerCase().includes(q) ||
      s.category.toLowerCase().includes(q) ||
      s.functions.toLowerCase().includes(q) ||
      s.notes.toLowerCase().includes(q)
    );
  });
}

export function landscapeStats() {
  const systems = INTEGRATION_LANDSCAPE.systems;
  return {
    totalSystems: systems.length,
    totalCategories: INTEGRATION_LANDSCAPE.categories.length,
    publicApi: systems.filter((s) => s.apiTier === "public").length,
    partnerApi: systems.filter((s) => s.apiTier === "partner").length,
    limitedApi: systems.filter((s) => s.apiTier === "limited").length,
    nativeLive: systems.filter((s) => s.integrationMode === "native_live").length,
    nativePlanned: systems.filter((s) => s.integrationMode === "native_planned").length,
  };
}
