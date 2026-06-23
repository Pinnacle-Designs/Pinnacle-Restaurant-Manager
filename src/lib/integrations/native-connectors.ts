/** In-app connectors — live OAuth/API flows or deep links into Pinnacle features. */
export type ConnectorStatus = "live" | "beta" | "planned" | "partner";

export type ConnectAction =
  | { type: "accounting"; provider: "QUICKBOOKS" | "XERO" | "SAGE" }
  | { type: "vendor"; provider: "SYSCO" | "US_FOODS" | "GORDON_FOOD_SERVICE" }
  | { type: "payment"; provider: "stripe" | "square" }
  | { type: "pos_sync" }
  | { type: "page"; href: string }
  | { type: "webhook"; endpoint: string }
  | { type: "csv_import"; href: string };

export interface NativeConnector {
  systemIds: string[];
  status: ConnectorStatus;
  label: string;
  connect?: ConnectAction;
  pinnacleArea: string;
}

export const NATIVE_CONNECTORS: NativeConnector[] = [
  {
    systemIds: [
      "square-for-restaurants",
      "square-payments",
      "square-online",
      "square-catalog",
      "square-loyalty",
      "square-dashboard",
      "square-kds",
      "square-kiosk-qr-ordering",
    ],
    status: "live",
    label: "Connect Square",
    connect: { type: "payment", provider: "square" },
    pinnacleArea: "Account → Billing",
  },
  {
    systemIds: ["stripe"],
    status: "live",
    label: "Connect Stripe",
    connect: { type: "payment", provider: "stripe" },
    pinnacleArea: "Account → Billing",
  },
  {
    systemIds: ["quickbooks-online"],
    status: "beta",
    label: "Connect QuickBooks",
    connect: { type: "accounting", provider: "QUICKBOOKS" },
    pinnacleArea: "Account → Integrations",
  },
  {
    systemIds: ["xero"],
    status: "beta",
    label: "Connect Xero",
    connect: { type: "accounting", provider: "XERO" },
    pinnacleArea: "Account → Integrations",
  },
  {
    systemIds: ["sage-intacct"],
    status: "beta",
    label: "Connect Sage Intacct",
    connect: { type: "accounting", provider: "SAGE" },
    pinnacleArea: "Account → Integrations",
  },
  {
    systemIds: ["sysco-shop"],
    status: "beta",
    label: "Connect Sysco",
    connect: { type: "vendor", provider: "SYSCO" },
    pinnacleArea: "Loading dock / POs",
  },
  {
    systemIds: ["us-foods-mox"],
    status: "beta",
    label: "Connect US Foods",
    connect: { type: "vendor", provider: "US_FOODS" },
    pinnacleArea: "Loading dock / POs",
  },
  {
    systemIds: ["gordon-food-service-tools"],
    status: "beta",
    label: "Connect Gordon Food Service",
    connect: { type: "vendor", provider: "GORDON_FOOD_SERVICE" },
    pinnacleArea: "Loading dock / POs",
  },
  {
    systemIds: [
      "toast",
      "toast-payments",
      "toast-online-ordering",
      "toast-menus",
      "toast-kds",
      "toast-analytics",
      "toast-loyalty",
      "toast-kiosk",
      "xtrachef-by-toast",
      "sling-by-toast",
      "toast-payroll",
      "toast-catering-events",
    ],
    status: "planned",
    label: "Toast partner API",
    connect: { type: "pos_sync" },
    pinnacleArea: "POS sync & menu import",
  },
  {
    systemIds: ["clover", "clover-fiserv", "clover-online-ordering", "clover-inventory-menu", "clover-reporting"],
    status: "planned",
    label: "Clover REST API",
    connect: { type: "pos_sync" },
    pinnacleArea: "POS sync & catalog",
  },
  {
    systemIds: ["meta-business-suite"],
    status: "live",
    label: "Manage social",
    connect: { type: "page", href: "/social" },
    pinnacleArea: "Social hub",
  },
  {
    systemIds: ["chatgpt-openai-api"],
    status: "live",
    label: "AI insights",
    connect: { type: "page", href: "/insights" },
    pinnacleArea: "AI Insights",
  },
  {
    systemIds: ["zapier", "zapier-ai-make-ai", "make", "n8n"],
    status: "beta",
    label: "Webhook bridge",
    connect: { type: "webhook", endpoint: "/api/integrations/webhook" },
    pinnacleArea: "Automation bridge",
  },
  {
    systemIds: ["7shifts", "deputy", "when-i-work", "homebase"],
    status: "planned",
    label: "Labor sync",
    connect: { type: "page", href: "/staff?tab=schedule" },
    pinnacleArea: "Staff & scheduling",
  },
  {
    systemIds: ["deliverect", "otter", "chowly", "itsacheckmate", "cuboh"],
    status: "planned",
    label: "Delivery aggregation",
    connect: { type: "page", href: "/analytics?tab=delivery" },
    pinnacleArea: "Delivery channel analytics",
  },
  {
    systemIds: ["doordash", "uber-eats", "grubhub", "doordash-storefront"],
    status: "planned",
    label: "Marketplace sync",
    connect: { type: "page", href: "/analytics" },
    pinnacleArea: "Sales & delivery reporting",
  },
  {
    systemIds: ["google-business-profile"],
    status: "planned",
    label: "Reviews & listings",
    connect: { type: "page", href: "/social" },
    pinnacleArea: "Reputation workflow",
  },
  {
    systemIds: ["mailchimp", "klaviyo", "hubspot"],
    status: "planned",
    label: "Marketing sync",
    connect: { type: "page", href: "/social" },
    pinnacleArea: "Campaign calendar",
  },
  {
    systemIds: ["marketman", "marginedge", "restaurant365", "wisk", "apicbase"],
    status: "planned",
    label: "Inventory import",
    connect: { type: "csv_import", href: "/inventory?tab=monthly" },
    pinnacleArea: "Inventory & food cost",
  },
  {
    systemIds: ["gusto", "adp", "paychex"],
    status: "planned",
    label: "Payroll export",
    connect: { type: "page", href: "/staff?tab=payroll" },
    pinnacleArea: "Payroll",
  },
  {
    systemIds: ["opentable", "resy", "sevenrooms", "tock"],
    status: "beta",
    label: "Reservations sync",
    connect: { type: "page", href: "/tables" },
    pinnacleArea: "Tables & covers",
  },
];

const connectorBySystemId = new Map<string, NativeConnector>();
for (const connector of NATIVE_CONNECTORS) {
  for (const id of connector.systemIds) {
    connectorBySystemId.set(id, connector);
  }
}

export function getNativeConnector(systemId: string): NativeConnector | undefined {
  return connectorBySystemId.get(systemId);
}
