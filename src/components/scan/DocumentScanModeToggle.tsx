"use client";

import { cn } from "@/lib/utils";

export type DocumentScanMode = "single" | "multi" | "panorama";

interface DocumentScanModeToggleProps {
  mode: DocumentScanMode;
  onChange: (mode: DocumentScanMode) => void;
  accent?: "green" | "orange";
  className?: string;
}

export function DocumentScanModeToggle({
  mode,
  onChange,
  accent = "green",
  className,
}: DocumentScanModeToggleProps) {
  const activeClass =
    accent === "orange" ? "bg-orange-600 text-white" : "bg-green-600 text-white";

  const options: { id: DocumentScanMode; label: string }[] = [
    { id: "single", label: "Single page" },
    { id: "multi", label: "Multi-page" },
    { id: "panorama", label: "Panoramic" },
  ];

  return (
    <div className={cn("flex rounded-lg border border-slate-200 p-0.5 text-xs sm:text-sm", className)}>
      {options.map((opt) => (
        <button
          key={opt.id}
          type="button"
          onClick={() => onChange(opt.id)}
          className={cn(
            "flex-1 rounded-md px-2 py-1.5 font-medium transition sm:px-3",
            mode === opt.id ? activeClass : "text-slate-600 hover:bg-slate-50"
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
