"use client";

import { PrintButton } from "@/components/ui/PrintButton";

interface PageHeaderProps {
  title: string;
  description?: string;
  children?: React.ReactNode;
  /** Show print report button (default: true) */
  showPrint?: boolean;
}

export function PageHeader({ title, description, children, showPrint = true }: PageHeaderProps) {
  return (
    <div className="page-header mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
        {description && (
          <p className="mt-1 text-sm text-slate-500">{description}</p>
        )}
      </div>
      {(showPrint || children) && (
        <div className="no-print flex flex-wrap items-center gap-2">
          {showPrint && <PrintButton reportTitle={title} />}
          {children}
        </div>
      )}
    </div>
  );
}
