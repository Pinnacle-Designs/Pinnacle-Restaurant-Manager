/** Seat numbers 1..capacity for a table (capped for UI). */
export function seatNumbersForCapacity(capacity: number | null | undefined): number[] {
  const n = Math.max(1, Math.min(24, capacity ?? 4));
  return Array.from({ length: n }, (_, i) => i + 1);
}

export interface TableWithSeats {
  id: string;
  number: number;
  capacity: number;
}
