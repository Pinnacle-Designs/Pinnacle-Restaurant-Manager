"use client";

import { PRO_CLEAN_DEFAULT_EMAIL } from "@/lib/pro-clean-email";

const PRO_CLEAN_PASSWORD = "PinnaclePro2026!";

interface ProCleanDevLoginProps {
  onLogin: (email: string, password: string) => Promise<void>;
  loading: boolean;
}

/** Dev-only — empty Pro workspace (not the seeded plan demo). */
export function ProCleanDevLogin({ onLogin, loading }: ProCleanDevLoginProps) {
  if (process.env.NODE_ENV !== "development") return null;

  return (
    <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50/80 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">
        Empty Pro workspace (dev)
      </p>
      <p className="mt-1 text-xs text-emerald-900">
        <strong>{PRO_CLEAN_DEFAULT_EMAIL}</strong> — no sample menu, orders, or staff. Use this
        instead of the plan demo buttons above when you need a clean Pro tenant.
      </p>
      <button
        type="button"
        disabled={loading}
        onClick={() => onLogin(PRO_CLEAN_DEFAULT_EMAIL, PRO_CLEAN_PASSWORD)}
        className="mt-3 w-full rounded-lg border border-emerald-300 bg-white px-3 py-2 text-left text-sm font-medium text-emerald-950 hover:border-emerald-400 hover:bg-emerald-50 disabled:opacity-50"
      >
        Sign in to Clean Pro Restaurant
      </button>
    </div>
  );
}
