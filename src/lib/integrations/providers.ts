import type { AccountingProvider, VendorEdiProvider } from "@prisma/client";

export const ACCOUNTING_PROVIDERS: Array<{
  id: AccountingProvider;
  name: string;
  description: string;
}> = [
  {
    id: "QUICKBOOKS",
    name: "QuickBooks Online",
    description: "Push invoices, credits, and inventory valuations as journal entries.",
  },
  {
    id: "XERO",
    name: "Xero",
    description: "Sync purchases, COGS, and vendor bills to your Xero chart of accounts.",
  },
  {
    id: "SAGE",
    name: "Sage Intacct",
    description: "Multi-entity GL posting for restaurant groups and franchises.",
  },
];

export const VENDOR_EDI_PROVIDERS: Array<{
  id: VendorEdiProvider;
  name: string;
  description: string;
}> = [
  {
    id: "SYSCO",
    name: "Sysco",
    description: "Live catalog, warehouse stock signals, and direct PO submission.",
  },
  {
    id: "US_FOODS",
    name: "US Foods",
    description: "EDI catalog sync, out-of-stock alerts, and automated reordering.",
  },
];

export function accountingProviderLabel(provider: AccountingProvider): string {
  return ACCOUNTING_PROVIDERS.find((p) => p.id === provider)?.name ?? provider;
}

export function vendorEdiProviderLabel(provider: VendorEdiProvider): string {
  return VENDOR_EDI_PROVIDERS.find((p) => p.id === provider)?.name ?? provider;
}
