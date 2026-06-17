"use client";

import { Printer } from "lucide-react";
import { cn } from "@/lib/utils";
import { printReport } from "@/lib/print";

interface PrintButtonProps {
  reportTitle?: string;
  label?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const sizes = {
  sm: "px-3 py-1.5 text-sm",
  md: "px-4 py-2 text-sm",
  lg: "px-6 py-3 text-base",
};

export function PrintButton({
  reportTitle,
  label = "Print report",
  size = "sm",
  className,
}: PrintButtonProps) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors",
        "bg-slate-100 text-slate-700 hover:bg-slate-200",
        sizes[size],
        className
      )}
      onClick={() => printReport(reportTitle)}
      title="Print this page as a report"
    >
      <Printer className="h-4 w-4" />
      {label}
    </button>
  );
}
