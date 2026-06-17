"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui";
import { printReport } from "@/lib/print";

interface PrintButtonProps {
  reportTitle?: string;
  label?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function PrintButton({
  reportTitle,
  label = "Print report",
  size = "sm",
  className,
}: PrintButtonProps) {
  return (
    <Button
      type="button"
      variant="secondary"
      size={size}
      className={className}
      onClick={() => printReport(reportTitle)}
      title="Print this page as a report"
    >
      <Printer className="h-4 w-4" />
      {label}
    </Button>
  );
}
