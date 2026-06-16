"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Clock, Loader2 } from "lucide-react";
import { Button } from "@/components/ui";
import { formatCurrency } from "@/lib/utils";

type Warning = {
  entryId: string;
  staffName: string;
  staffRole: string;
  scheduledEndLabel: string;
  shiftLabel: string;
  minutesPastShiftEnd: number;
  phantomHours: number;
  phantomPay: number;
};

interface ForgottenClockOutAlertProps {
  variant?: "banner" | "panel";
  onResolved?: () => void;
  className?: string;
}

export function ForgottenClockOutAlert({
  variant = "banner",
  onResolved,
  className = "",
}: ForgottenClockOutAlertProps) {
  const [graceMins, setGraceMins] = useState(30);
  const [warnings, setWarnings] = useState<Warning[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/timeclock/forgotten-clock-outs");
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 403) {
          setWarnings([]);
          return;
        }
        throw new Error(data.error || "Could not load clock-out warnings");
      }
      setGraceMins(data.graceMins ?? 30);
      setWarnings(data.warnings ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 60_000);
    return () => clearInterval(interval);
  }, [load]);

  const resolveAtShiftEnd = async (entryId: string) => {
    setActing(entryId);
    setError(null);
    try {
      const res = await fetch("/api/timeclock/forgotten-clock-outs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "clock_out_at_shift_end", entryId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not resolve punch");
      await load();
      onResolved?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setActing(null);
    }
  };

  if (loading) {
    if (variant === "banner") return null;
    return (
      <div className={`flex items-center gap-2 text-sm text-slate-500 ${className}`}>
        <Loader2 className="h-4 w-4 animate-spin" />
        Checking for forgotten clock-outs…
      </div>
    );
  }

  if (warnings.length === 0) return null;

  const totalPhantom = warnings.reduce((sum, w) => sum + w.phantomPay, 0);

  if (variant === "banner") {
    return (
      <div
        className={`mb-6 rounded-xl border border-amber-300 bg-amber-50 p-4 ${className}`}
        role="alert"
      >
        <div className="flex flex-wrap items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-amber-950">
              Forgotten clock-out{warnings.length > 1 ? "s" : ""} — resolve before end-of-day
              reports
            </p>
            <p className="mt-1 text-sm text-amber-900">
              {warnings.length === 1 ? (
                <>
                  <strong>{warnings[0].staffName}</strong> ({warnings[0].staffRole}) was scheduled
                  until {warnings[0].scheduledEndLabel} but is still clocked in (
                  {warnings[0].minutesPastShiftEnd} min past shift end).
                </>
              ) : (
                <>
                  {warnings.length} employees are still clocked in past their scheduled shift end
                  (after {graceMins}-min grace). Up to{" "}
                  <strong>{formatCurrency(totalPhantom)}</strong> in phantom hours if not corrected.
                </>
              )}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link
                href="/staff?tab=punches"
                className="inline-flex items-center rounded-lg bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700"
              >
                Review punches
              </Link>
              {warnings.length === 1 && (
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={acting === warnings[0].entryId}
                  onClick={() => resolveAtShiftEnd(warnings[0].entryId)}
                >
                  {acting === warnings[0].entryId ? "Saving…" : "Clock out at shift end"}
                </Button>
              )}
            </div>
            {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`rounded-xl border border-amber-300 bg-amber-50 p-5 ${className}`}
      role="alert"
    >
      <div className="mb-4 flex items-center gap-2">
        <AlertTriangle className="h-5 w-5 text-amber-600" />
        <h3 className="font-semibold text-amber-950">
          Auto clock-out warnings ({warnings.length})
        </h3>
      </div>
      <p className="mb-4 text-sm text-amber-900">
        These team members forgot to clock out after their scheduled shift ended ({graceMins}-minute
        grace). Correct punches before running payroll or end-of-day labor reports — otherwise they
        may accrue hours while off-site.
      </p>
      <ul className="space-y-3">
        {warnings.map((w) => (
          <li
            key={w.entryId}
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-white/80 px-4 py-3"
          >
            <div className="min-w-0">
              <p className="font-medium text-slate-900">
                {w.staffName}{" "}
                <span className="text-sm font-normal text-slate-500">· {w.staffRole}</span>
              </p>
              <p className="text-sm text-slate-600">
                Shift {w.shiftLabel} · scheduled end {w.scheduledEndLabel} ·{" "}
                <span className="font-medium text-amber-800">
                  {w.minutesPastShiftEnd} min still on clock
                </span>
              </p>
              <p className="text-xs text-slate-500">
                Phantom time: {w.phantomHours}h
                {w.phantomPay > 0 ? ` (~${formatCurrency(w.phantomPay)})` : ""}
              </p>
            </div>
            <Button
              size="sm"
              variant="secondary"
              disabled={acting === w.entryId}
              onClick={() => resolveAtShiftEnd(w.entryId)}
            >
              <Clock className="mr-1.5 h-4 w-4" />
              {acting === w.entryId ? "Saving…" : "Clock out at shift end"}
            </Button>
          </li>
        ))}
      </ul>
      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
    </div>
  );
}
