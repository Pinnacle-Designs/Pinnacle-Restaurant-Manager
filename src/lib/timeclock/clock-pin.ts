import { hashPassword, verifyPassword } from "@/lib/auth";

export function isValidClockPin(pin: string): boolean {
  return /^\d{4,6}$/.test(pin);
}

export function hashClockPin(pin: string): string {
  return hashPassword(pin);
}

export function verifyClockPin(pin: string, stored: string | null | undefined): boolean {
  if (!stored) return false;
  return verifyPassword(pin, stored);
}
