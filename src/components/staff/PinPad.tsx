"use client";

import { Delete } from "lucide-react";
import { cn } from "@/lib/utils";

interface PinPadProps {
  value: string;
  onChange: (value: string) => void;
  maxLength?: number;
  disabled?: boolean;
  className?: string;
}

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "del"] as const;

export function PinPad({
  value,
  onChange,
  maxLength = 6,
  disabled = false,
  className,
}: PinPadProps) {
  const press = (key: string) => {
    if (disabled) return;
    if (key === "del") {
      onChange(value.slice(0, -1));
      return;
    }
    if (!key || value.length >= maxLength) return;
    onChange(value + key);
  };

  return (
    <div className={cn("space-y-4", className)}>
      <div className="flex justify-center gap-2">
        {Array.from({ length: maxLength === 4 ? 4 : 6 }).map((_, i) => (
          <div
            key={i}
            className={cn(
              "h-3 w-3 rounded-full border-2 transition-colors",
              i < value.length ? "border-orange-500 bg-orange-500" : "border-slate-300 bg-white"
            )}
          />
        ))}
      </div>

      <div className="mx-auto grid max-w-xs grid-cols-3 gap-2">
        {KEYS.map((key, idx) => {
          if (key === "") {
            return <div key={`spacer-${idx}`} />;
          }
          const isDel = key === "del";
          return (
            <button
              key={key}
              type="button"
              disabled={disabled}
              onClick={() => press(key)}
              className={cn(
                "flex h-14 items-center justify-center rounded-xl text-xl font-semibold transition-colors",
                isDel
                  ? "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  : "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200 hover:bg-orange-50 hover:ring-orange-200 active:bg-orange-100",
                disabled && "opacity-50"
              )}
            >
              {isDel ? <Delete className="h-5 w-5" /> : key}
            </button>
          );
        })}
      </div>
    </div>
  );
}
