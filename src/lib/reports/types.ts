import type { Permission } from "@/lib/permissions";

export type ReportColumnType = "text" | "number" | "currency" | "percent" | "date" | "badge";

export interface ReportColumnDef {
  id: string;
  label: string;
  type: ReportColumnType;
  defaultVisible?: boolean;
}

export interface ReportDefinition {
  id: string;
  label: string;
  category: string;
  description: string;
  permission: Permission;
  columns: ReportColumnDef[];
  defaultSort?: { column: string; direction: "asc" | "desc" };
  defaultFilters?: ReportFilters;
}

export interface ReportFilters {
  days?: number;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  category?: string;
  vendor?: string;
  flag?: string;
  status?: string;
  months?: number;
}

export interface ReportBranding {
  title?: string;
  subtitle?: string;
  footer?: string;
  showTimestamp?: boolean;
  showLocation?: boolean;
}

export interface ReportConfig {
  reportId: string;
  name?: string;
  columns: string[];
  columnLabels?: Record<string, string>;
  filters: ReportFilters;
  sort?: { column: string; direction: "asc" | "desc" };
  branding?: ReportBranding;
  rowLimit?: number | null;
  visualization?: "table" | "bar" | "line";
}

export type ReportRow = Record<string, string | number | null | undefined>;

export interface ReportResult {
  reportId: string;
  title: string;
  subtitle?: string;
  footer?: string;
  columns: { id: string; label: string; type: ReportColumnType }[];
  rows: ReportRow[];
  meta: {
    totalRows: number;
    generatedAt: string;
    locationName?: string;
  };
}

export interface ReportTemplateRecord {
  id: string;
  reportId: string;
  name: string;
  description: string | null;
  config: ReportConfig;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}
