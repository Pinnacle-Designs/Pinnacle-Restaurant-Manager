"use client";

import { cn } from "@/lib/utils";
import { seatNumbersForCapacity } from "@/lib/tables/seats";

interface SeatPickerProps {
  capacity: number;
  value: number | null;
  onChange: (seat: number | null) => void;
  /** Allow clearing selection (walk-in / shared items) */
  allowShared?: boolean;
  sharedLabel?: string;
  className?: string;
}

export function SeatPicker({
  capacity,
  value,
  onChange,
  allowShared = false,
  sharedLabel = "Shared",
  className,
}: SeatPickerProps) {
  const seats = seatNumbersForCapacity(capacity);

  return (
    <div className={cn("flex flex-wrap gap-1", className)}>
      {allowShared && (
        <button
          type="button"
          onClick={() => onChange(null)}
          className={cn(
            "rounded-lg px-2.5 py-1.5 text-xs font-semibold",
            value === null
              ? "bg-slate-800 text-white"
              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          )}
        >
          {sharedLabel}
        </button>
      )}
      {seats.map((seat) => (
        <button
          key={seat}
          type="button"
          onClick={() => onChange(seat)}
          className={cn(
            "rounded-lg px-2.5 py-1.5 text-xs font-semibold",
            value === seat
              ? "bg-orange-500 text-white"
              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          )}
        >
          Seat {seat}
        </button>
      ))}
    </div>
  );
}
