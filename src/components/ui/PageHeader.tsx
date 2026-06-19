"use client";

import { PrintButton } from "@/components/ui/PrintButton";
import { ReportToolbar } from "@/components/reports/ReportToolbar";

interface PageHeaderProps {
  title: string;
  description?: string;
  children?: React.ReactNode;
  /** Show print report button (default: true) */
  showPrint?: boolean;
  /** Pre-select this report in the Reports customizer */
  reportId?: string;
}

export function PageHeader({ title, description, children, showPrint = true, reportId }: PageHeaderProps) {
  return (
    <div className="page-header page-content mb-4 flex flex-col gap-3 sm:mb-6 sm:gap-4 md:flex-row md:items-start md:justify-between">
      <div className="min-w-0">
        <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">{title}</h1>
        {description && (
          <p className="mt-1 text-sm text-slate-500">{description}</p>
        )}
      </div>
      {(showPrint || children) && (
        <div className="no-print flex w-full shrink-0 flex-wrap items-center gap-2 sm:w-auto">
          {showPrint && <PrintButton reportTitle={title} />}
          {reportId && <ReportToolbar reportId={reportId} />}
          {children}
        </div>
      )}
    </div>
  );
}
