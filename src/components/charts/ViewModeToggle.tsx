"use client";

import type { ReactNode } from "react";
import { BarChart3, LineChart, Table2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type DataViewMode = "table" | "chart";
export type ReportViewMode = "table" | "bar" | "line";

interface ViewModeToggleProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: Array<{ value: T; label: string; icon?: ReactNode }>;
  className?: string;
}

export function ViewModeToggle<T extends string>({
  value,
  onChange,
  options,
  className,
}: ViewModeToggleProps<T>) {
  return (
    <div
      className={cn(
        "inline-flex rounded-lg border border-slate-200 bg-white p-0.5",
        className
      )}
      role="group"
      aria-label="View mode"
    >
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors sm:px-3 sm:text-sm",
            value === opt.value
              ? "bg-orange-500 text-white"
              : "text-slate-600 hover:bg-slate-50"
          )}
          aria-pressed={value === opt.value}
        >
          {opt.icon}
          <span className="hidden sm:inline">{opt.label}</span>
        </button>
      ))}
    </div>
  );
}

export const ANALYTICS_VIEW_OPTIONS: Array<{
  value: DataViewMode;
  label: string;
  icon: ReactNode;
}> = [
  { value: "table", label: "Table", icon: <Table2 className="h-4 w-4" /> },
  { value: "chart", label: "Chart", icon: <BarChart3 className="h-4 w-4" /> },
];

export const REPORT_VIEW_OPTIONS: Array<{
  value: ReportViewMode;
  label: string;
  icon: ReactNode;
}> = [
  { value: "table", label: "Table", icon: <Table2 className="h-4 w-4" /> },
  { value: "bar", label: "Bar chart", icon: <BarChart3 className="h-4 w-4" /> },
  { value: "line", label: "Line chart", icon: <LineChart className="h-4 w-4" /> },
];
