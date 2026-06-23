"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  ChevronDown,
  ChevronUp,
  Download,
  FileJson,
  Loader2,
  Printer,
  Save,
  Trash2,
  Play,
} from "lucide-react";
import { Button } from "@/components/ui";
import { Input, FormField } from "@/components/ui/form";
import { PageSectionShell, PageSection } from "@/components/layout/PageSections";
import { ReportViewer } from "@/components/reports/ReportViewer";
import { defaultReportConfig } from "@/lib/reports/registry";
import {
  ViewModeToggle,
  REPORT_VIEW_OPTIONS,
  type ReportViewMode,
} from "@/components/charts";
import {
  downloadReportCsv,
  downloadReportJson,
  printCustomReport,
} from "@/lib/reports/export";
import type {
  ReportConfig,
  ReportDefinition,
  ReportResult,
  ReportTemplateRecord,
} from "@/lib/reports/types";
import { parseJsonResponse } from "@/lib/fetch-json";

export function ReportsClient() {
  const searchParams = useSearchParams();
  const initialReport = searchParams.get("report") ?? "sales-by-item";

  const [catalog, setCatalog] = useState<Record<string, ReportDefinition[]>>({});
  const [selectedReportId, setSelectedReportId] = useState(initialReport);
  const [config, setConfig] = useState<ReportConfig>(() => {
    try {
      return defaultReportConfig(initialReport);
    } catch {
      return defaultReportConfig("sales-by-item");
    }
  });
  const [templates, setTemplates] = useState<ReportTemplateRecord[]>([]);
  const [result, setResult] = useState<ReportResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [templateName, setTemplateName] = useState("");

  const selectedDef = useMemo(() => {
    for (const reports of Object.values(catalog)) {
      const found = reports.find((r) => r.id === selectedReportId);
      if (found) return found;
    }
    return null;
  }, [catalog, selectedReportId]);

  const loadCatalog = useCallback(async () => {
    const res = await fetch("/api/reports/registry");
    const data = await parseJsonResponse<{ byCategory?: Record<string, ReportDefinition[]> }>(res);
    if (res.ok && data.byCategory) setCatalog(data.byCategory);
  }, []);

  const loadTemplates = useCallback(async (reportId: string) => {
    const res = await fetch(`/api/reports/templates?reportId=${encodeURIComponent(reportId)}`);
    const data = await parseJsonResponse<ReportTemplateRecord[]>(res);
    if (res.ok) setTemplates(data);
  }, []);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  useEffect(() => {
    void loadTemplates(selectedReportId);
  }, [selectedReportId, loadTemplates]);

  const selectReport = (reportId: string) => {
    setSelectedReportId(reportId);
    setConfig(defaultReportConfig(reportId));
    setResult(null);
    setError(null);
    setTemplateName("");
  };

  const toggleColumn = (colId: string) => {
    setConfig((prev) => {
      const has = prev.columns.includes(colId);
      return {
        ...prev,
        columns: has
          ? prev.columns.filter((c) => c !== colId)
          : [...prev.columns, colId],
      };
    });
  };

  const moveColumn = (colId: string, dir: -1 | 1) => {
    setConfig((prev) => {
      const idx = prev.columns.indexOf(colId);
      if (idx < 0) return prev;
      const next = [...prev.columns];
      const swap = idx + dir;
      if (swap < 0 || swap >= next.length) return prev;
      [next[idx], next[swap]] = [next[swap], next[idx]];
      return { ...prev, columns: next };
    });
  };

  const runReport = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/reports/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config: { ...config, reportId: selectedReportId } }),
      });
      const data = await parseJsonResponse<ReportResult & { error?: string }>(res);
      if (!res.ok) throw new Error(data.error ?? "Report failed");
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Report failed");
    } finally {
      setLoading(false);
    }
  };

  const saveTemplate = async () => {
    if (!templateName.trim()) {
      setError("Enter a template name");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/reports/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reportId: selectedReportId,
          name: templateName.trim(),
          config: { ...config, reportId: selectedReportId },
        }),
      });
      const data = await parseJsonResponse<{ error?: string }>(res);
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      setTemplateName("");
      await loadTemplates(selectedReportId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const applyTemplate = (t: ReportTemplateRecord) => {
    setConfig(t.config);
    setResult(null);
  };

  const deleteTemplate = async (id: string) => {
    const res = await fetch(`/api/reports/templates/${id}`, { method: "DELETE" });
    if (res.ok) await loadTemplates(selectedReportId);
  };

  const allColumns = selectedDef?.columns ?? [];
  const visibleSet = new Set(config.columns);

  return (
    <PageSectionShell pageId="reports">
      <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,240px)_1fr]">
        <PageSection id="report-catalog" title="Report catalog" defaultOpen>
          <div className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
            {Object.entries(catalog).map(([category, reports]) => (
              <div key={category}>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {category}
                </p>
                <ul className="space-y-0.5">
                  {reports.map((r) => (
                    <li key={r.id}>
                      <button
                        type="button"
                        onClick={() => selectReport(r.id)}
                        className={`w-full rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                          selectedReportId === r.id
                            ? "bg-orange-100 font-medium text-orange-900"
                            : "text-slate-700 hover:bg-slate-100"
                        }`}
                      >
                        {r.label}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </PageSection>

        <div className="min-w-0 space-y-6">
          {selectedDef && (
            <p className="text-sm text-slate-600">{selectedDef.description}</p>
          )}

          <PageSection id="report-columns" title="Columns" defaultOpen>
            <p className="mb-3 text-xs text-slate-500">
              Toggle visibility, reorder, and rename column headers.
            </p>
            <ul className="space-y-2">
              {allColumns.map((col) => {
                const visible = visibleSet.has(col.id);
                const orderIdx = config.columns.indexOf(col.id);
                return (
                  <li
                    key={col.id}
                    className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-100 px-3 py-2"
                  >
                    <input
                      type="checkbox"
                      checked={visible}
                      onChange={() => toggleColumn(col.id)}
                      className="h-4 w-4 accent-orange-600"
                    />
                    <span className="min-w-[100px] flex-1 text-sm font-medium">{col.label}</span>
                    {visible && (
                      <>
                        <Input
                          className="max-w-[160px] py-1 text-xs"
                          placeholder="Custom label"
                          value={config.columnLabels?.[col.id] ?? ""}
                          onChange={(e) =>
                            setConfig((prev) => ({
                              ...prev,
                              columnLabels: {
                                ...prev.columnLabels,
                                [col.id]: e.target.value,
                              },
                            }))
                          }
                        />
                        <div className="flex gap-1">
                          <button
                            type="button"
                            disabled={orderIdx <= 0}
                            onClick={() => moveColumn(col.id, -1)}
                            className="rounded p-1 text-slate-400 hover:bg-slate-100 disabled:opacity-30"
                            aria-label="Move up"
                          >
                            <ChevronUp className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            disabled={orderIdx < 0 || orderIdx >= config.columns.length - 1}
                            onClick={() => moveColumn(col.id, 1)}
                            className="rounded p-1 text-slate-400 hover:bg-slate-100 disabled:opacity-30"
                            aria-label="Move down"
                          >
                            <ChevronDown className="h-4 w-4" />
                          </button>
                        </div>
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          </PageSection>

          <PageSection id="report-filters" title="Filters & sort" defaultOpen>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <FormField label="Search rows">
                <Input
                  value={config.filters.search ?? ""}
                  onChange={(e) =>
                    setConfig((prev) => ({
                      ...prev,
                      filters: { ...prev.filters, search: e.target.value },
                    }))
                  }
                  placeholder="Filter any column…"
                />
              </FormField>
              <FormField label="Last N days">
                <Input
                  type="number"
                  min={1}
                  value={config.filters.days ?? ""}
                  onChange={(e) =>
                    setConfig((prev) => ({
                      ...prev,
                      filters: {
                        ...prev.filters,
                        days: e.target.value ? parseInt(e.target.value, 10) : undefined,
                      },
                    }))
                  }
                  placeholder="30"
                />
              </FormField>
              <FormField label="Date from">
                <Input
                  type="date"
                  value={config.filters.dateFrom ?? ""}
                  onChange={(e) =>
                    setConfig((prev) => ({
                      ...prev,
                      filters: { ...prev.filters, dateFrom: e.target.value || undefined },
                    }))
                  }
                />
              </FormField>
              <FormField label="Date to">
                <Input
                  type="date"
                  value={config.filters.dateTo ?? ""}
                  onChange={(e) =>
                    setConfig((prev) => ({
                      ...prev,
                      filters: { ...prev.filters, dateTo: e.target.value || undefined },
                    }))
                  }
                />
              </FormField>
              <FormField label="Category contains">
                <Input
                  value={config.filters.category ?? ""}
                  onChange={(e) =>
                    setConfig((prev) => ({
                      ...prev,
                      filters: { ...prev.filters, category: e.target.value },
                    }))
                  }
                />
              </FormField>
              <FormField label="Vendor contains">
                <Input
                  value={config.filters.vendor ?? ""}
                  onChange={(e) =>
                    setConfig((prev) => ({
                      ...prev,
                      filters: { ...prev.filters, vendor: e.target.value },
                    }))
                  }
                />
              </FormField>
              <FormField label="Variance flag">
                <select
                  className="input w-full"
                  value={config.filters.flag ?? ""}
                  onChange={(e) =>
                    setConfig((prev) => ({
                      ...prev,
                      filters: { ...prev.filters, flag: e.target.value || undefined },
                    }))
                  }
                >
                  <option value="">Any</option>
                  <option value="OK">OK</option>
                  <option value="OVER">Over</option>
                  <option value="UNDER">Under</option>
                </select>
              </FormField>
              <FormField label="Sort by">
                <select
                  className="input w-full"
                  value={config.sort?.column ?? ""}
                  onChange={(e) =>
                    setConfig((prev) => ({
                      ...prev,
                      sort: e.target.value
                        ? {
                            column: e.target.value,
                            direction: prev.sort?.direction ?? "desc",
                          }
                        : undefined,
                    }))
                  }
                >
                  <option value="">Default</option>
                  {config.columns.map((id) => {
                    const col = allColumns.find((c) => c.id === id);
                    return (
                      <option key={id} value={id}>
                        {col?.label ?? id}
                      </option>
                    );
                  })}
                </select>
              </FormField>
              <FormField label="Sort direction">
                <select
                  className="input w-full"
                  value={config.sort?.direction ?? "desc"}
                  onChange={(e) =>
                    setConfig((prev) => ({
                      ...prev,
                      sort: {
                        column: prev.sort?.column ?? config.columns[0] ?? "",
                        direction: e.target.value as "asc" | "desc",
                      },
                    }))
                  }
                >
                  <option value="desc">Descending</option>
                  <option value="asc">Ascending</option>
                </select>
              </FormField>
              <FormField label="Row limit">
                <select
                  className="input w-full"
                  value={config.rowLimit === null ? "all" : String(config.rowLimit ?? 100)}
                  onChange={(e) =>
                    setConfig((prev) => ({
                      ...prev,
                      rowLimit: e.target.value === "all" ? null : parseInt(e.target.value, 10),
                    }))
                  }
                >
                  <option value="25">25 rows</option>
                  <option value="50">50 rows</option>
                  <option value="100">100 rows</option>
                  <option value="250">250 rows</option>
                  <option value="all">All rows</option>
                </select>
              </FormField>
            </div>
          </PageSection>

          <PageSection id="report-branding" title="Branding & layout" defaultOpen>
            <div className="mb-4">
              <p className="mb-2 text-xs font-medium text-slate-600">Preview display</p>
              <ViewModeToggle
                value={(config.visualization ?? "table") as ReportViewMode}
                onChange={(v) =>
                  setConfig((prev) => ({
                    ...prev,
                    visualization: v,
                  }))
                }
                options={REPORT_VIEW_OPTIONS}
              />
              <p className="mt-2 text-xs text-slate-500">
                Switch between table and chart views. Charts use the first label column and first numeric column.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Report title">
                <Input
                  value={config.branding?.title ?? selectedDef?.label ?? ""}
                  onChange={(e) =>
                    setConfig((prev) => ({
                      ...prev,
                      branding: { ...prev.branding, title: e.target.value },
                    }))
                  }
                />
              </FormField>
              <FormField label="Subtitle">
                <Input
                  value={config.branding?.subtitle ?? ""}
                  onChange={(e) =>
                    setConfig((prev) => ({
                      ...prev,
                      branding: { ...prev.branding, subtitle: e.target.value },
                    }))
                  }
                  placeholder="Optional subtitle"
                />
              </FormField>
              <FormField label="Footer note" className="sm:col-span-2">
                <Input
                  value={config.branding?.footer ?? ""}
                  onChange={(e) =>
                    setConfig((prev) => ({
                      ...prev,
                      branding: { ...prev.branding, footer: e.target.value },
                    }))
                  }
                  placeholder="Confidential — internal use only"
                />
              </FormField>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={config.branding?.showTimestamp !== false}
                  onChange={(e) =>
                    setConfig((prev) => ({
                      ...prev,
                      branding: { ...prev.branding, showTimestamp: e.target.checked },
                    }))
                  }
                  className="accent-orange-600"
                />
                Show print timestamp
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={config.branding?.showLocation !== false}
                  onChange={(e) =>
                    setConfig((prev) => ({
                      ...prev,
                      branding: { ...prev.branding, showLocation: e.target.checked },
                    }))
                  }
                  className="accent-orange-600"
                />
                Show location name
              </label>
            </div>
          </PageSection>

          {templates.length > 0 && (
            <PageSection id="saved-templates" title="Saved templates">
              <ul className="space-y-2">
                {templates.map((t) => (
                  <li
                    key={t.id}
                    className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2"
                  >
                    <button
                      type="button"
                      onClick={() => applyTemplate(t)}
                      className="text-left text-sm font-medium text-slate-800 hover:text-orange-700"
                    >
                      {t.name}
                    </button>
                    <button
                      type="button"
                      onClick={() => void deleteTemplate(t.id)}
                      className="text-slate-400 hover:text-red-600"
                      aria-label="Delete template"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            </PageSection>
          )}

          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void runReport()} disabled={loading || config.columns.length === 0}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              Run report
            </Button>
            {result && (
              <>
                <Button variant="secondary" onClick={() => printCustomReport(result)}>
                  <Printer className="h-4 w-4" />
                  Print
                </Button>
                <Button variant="secondary" onClick={() => downloadReportCsv(result)}>
                  <Download className="h-4 w-4" />
                  CSV
                </Button>
                <Button variant="secondary" onClick={() => downloadReportJson(result)}>
                  <FileJson className="h-4 w-4" />
                  JSON
                </Button>
              </>
            )}
          </div>

          <div className="flex flex-wrap items-end gap-2 border-t border-slate-100 pt-4">
            <FormField label="Save as template" className="min-w-[200px] flex-1">
              <Input
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder="My weekly sales report"
              />
            </FormField>
            <Button variant="secondary" onClick={() => void saveTemplate()} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save template
            </Button>
          </div>

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
          )}

          <PageSection id="report-preview" title="Preview" defaultOpen>
            <ReportViewer
              result={result}
              loading={loading}
              visualization={(config.visualization ?? "table") as ReportViewMode}
            />
          </PageSection>
        </div>
      </div>
    </PageSectionShell>
  );
}
