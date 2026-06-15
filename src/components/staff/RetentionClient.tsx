"use client";

import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import {
  MessageSquare,
  Star,
  TrendingDown,
  Users,
  AlertCircle,
  Trash2,
} from "lucide-react";
import { Button, EmptyState } from "@/components/ui";
import { Select, FormField } from "@/components/ui/form";
import { cn } from "@/lib/utils";
import { ShiftFeedbackModal, formatShiftLabel } from "@/components/staff/ShiftFeedbackModal";

type Section = "feedback" | "turnover";

interface StaffOption {
  id: string;
  name: string;
  role: string;
}

interface FeedbackEntry {
  id: string;
  kind: string;
  content: string;
  authorName: string;
  createdAt: string;
  staffMember: { id: string; name: string; role: string };
  shift?: {
    id: string;
    date: string;
    startTime: string;
    endTime: string;
    workRole: string | null;
  } | null;
}

interface TurnoverData {
  locationName: string;
  periodMonths: number;
  summary: {
    activeStaff: number;
    departures: number;
    turnoverRate: number;
    avgTenureDays: number | null;
    feedbackThisPeriod: number;
    shoutOutsThisPeriod: number;
  };
  byRole: { role: string; active: number; departures: number; rate: number }[];
  byShift: { bucket: string; label: string; departures: number; shiftCount: number; rate: number }[];
  recentDepartures: {
    id: string;
    name: string;
    role: string;
    terminatedAt: string;
    tenureDays: number;
    reason: string | null;
  }[];
  hotspots: string[];
}

const KIND_STYLES: Record<string, string> = {
  SHOUT_OUT: "bg-amber-50 border-amber-200 text-amber-900",
  NOTE: "bg-slate-50 border-slate-200 text-slate-800",
  COACHING: "bg-blue-50 border-blue-200 text-blue-900",
};

const KIND_LABELS: Record<string, string> = {
  SHOUT_OUT: "Shout-out",
  NOTE: "Note",
  COACHING: "Coaching",
};

export function RetentionClient({ staff }: { staff: StaffOption[] }) {
  const [section, setSection] = useState<Section>("feedback");
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<FeedbackEntry[]>([]);
  const [turnover, setTurnover] = useState<TurnoverData | null>(null);
  const [filterStaffId, setFilterStaffId] = useState("");
  const [feedbackModal, setFeedbackModal] = useState<{
    staffMemberId: string;
    staffName: string;
  } | null>(null);
  const [months, setMonths] = useState("12");

  const loadFeedback = useCallback(async () => {
    const qs = filterStaffId ? `?staffMemberId=${filterStaffId}` : "";
    const res = await fetch(`/api/retention/feedback${qs}`);
    const data = await res.json();
    setFeedback(data.feedback || []);
  }, [filterStaffId]);

  const loadTurnover = useCallback(async () => {
    const res = await fetch(`/api/retention?months=${months}`);
    setTurnover(await res.json());
  }, [months]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      await Promise.all([loadFeedback(), loadTurnover()]);
    } finally {
      setLoading(false);
    }
  }, [loadFeedback, loadTurnover]);

  useEffect(() => {
    load();
  }, [load]);

  const deleteFeedback = async (id: string) => {
    if (!confirm("Remove this feedback entry?")) return;
    await fetch(`/api/retention/feedback/${id}`, { method: "DELETE" });
    await loadFeedback();
  };

  if (loading && !turnover) {
    return <p className="py-8 text-center text-slate-500">Loading retention data…</p>;
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap gap-2">
        {(
          [
            { id: "feedback" as Section, label: "Shift feedback", icon: MessageSquare },
            { id: "turnover" as Section, label: "Turnover analytics", icon: TrendingDown },
          ] as const
        ).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setSection(id)}
            className={cn(
              "flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-colors",
              section === id
                ? "border-orange-500 bg-orange-50 text-orange-700"
                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {section === "feedback" && (
        <div className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex flex-wrap items-end gap-3">
              <FormField label="Filter by employee">
                <Select
                  value={filterStaffId}
                  onChange={(e) => setFilterStaffId(e.target.value)}
                  className="min-w-[200px]"
                >
                  <option value="">All team members</option>
                  {staff.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              </FormField>
            </div>
            <Button
              size="sm"
              onClick={() =>
                setFeedbackModal({
                  staffMemberId: filterStaffId || staff[0]?.id || "",
                  staffName: staff.find((s) => s.id === filterStaffId)?.name || staff[0]?.name || "Team member",
                })
              }
              disabled={staff.length === 0}
            >
              <Star className="h-4 w-4" />
              Add feedback
            </Button>
          </div>

          {feedback.length === 0 ? (
            <EmptyState
              icon={<MessageSquare className="h-12 w-12" />}
              title="No shift feedback yet"
              description="Leave a quick note or shout-out after a shift from the Schedule tab, or add one here."
            />
          ) : (
            <ul className="space-y-3">
              {feedback.map((entry) => (
                <li
                  key={entry.id}
                  className={cn(
                    "rounded-xl border p-4",
                    KIND_STYLES[entry.kind] ?? KIND_STYLES.NOTE
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                        <span>{entry.staffMember.name}</span>
                        <span className="rounded-full bg-white/60 px-2 py-0.5 text-xs font-medium">
                          {KIND_LABELS[entry.kind] ?? entry.kind}
                        </span>
                      </div>
                      {entry.shift && (
                        <p className="mt-1 text-xs opacity-80">
                          {formatShiftLabel(entry.shift)}
                        </p>
                      )}
                      <p className="mt-2 text-sm leading-relaxed">{entry.content}</p>
                      <p className="mt-2 text-xs opacity-70">
                        {entry.authorName} · {format(new Date(entry.createdAt), "MMM d, yyyy h:mm a")}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteFeedback(entry.id)}
                      title="Remove"
                    >
                      <Trash2 className="h-4 w-4 text-slate-400" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {section === "turnover" && turnover && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <p className="text-sm text-slate-600">
              {turnover.locationName} · last {turnover.periodMonths} months
            </p>
            <FormField label="Period">
              <Select value={months} onChange={(e) => setMonths(e.target.value)}>
                <option value="6">6 months</option>
                <option value="12">12 months</option>
                <option value="24">24 months</option>
              </Select>
            </FormField>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: "Active staff", value: turnover.summary.activeStaff, icon: Users },
              { label: "Departures", value: turnover.summary.departures, icon: TrendingDown },
              {
                label: "Annualized turnover",
                value: `${turnover.summary.turnoverRate}%`,
                icon: AlertCircle,
              },
              {
                label: "Shout-outs logged",
                value: turnover.summary.shoutOutsThisPeriod,
                icon: Star,
              },
            ].map(({ label, value, icon: Icon }) => (
              <div key={label} className="rounded-xl border bg-white p-4">
                <div className="flex items-center gap-2 text-slate-500">
                  <Icon className="h-4 w-4" />
                  <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
                </div>
                <p className="mt-2 text-2xl font-bold text-slate-900">{value}</p>
              </div>
            ))}
          </div>

          {turnover.hotspots.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
              <h3 className="text-sm font-semibold text-amber-900">Culture & retention signals</h3>
              <ul className="mt-2 space-y-1 text-sm text-amber-800">
                {turnover.hotspots.map((msg) => (
                  <li key={msg}>• {msg}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-xl border bg-white p-4">
              <h3 className="font-semibold text-slate-900">Turnover by role</h3>
              <p className="mt-1 text-xs text-slate-500">Departures vs. role headcount in period</p>
              <table className="mt-4 w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-slate-500">
                    <th className="pb-2 font-medium">Role</th>
                    <th className="pb-2 font-medium">Active</th>
                    <th className="pb-2 font-medium">Left</th>
                    <th className="pb-2 text-right font-medium">Rate</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {turnover.byRole.map((row) => (
                    <tr key={row.role}>
                      <td className="py-2 font-medium">{row.role}</td>
                      <td className="py-2">{row.active}</td>
                      <td className="py-2">{row.departures}</td>
                      <td
                        className={cn(
                          "py-2 text-right font-medium",
                          row.rate >= 20 && "text-red-600"
                        )}
                      >
                        {row.rate}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="rounded-xl border bg-white p-4">
              <h3 className="font-semibold text-slate-900">Turnover by shift pattern</h3>
              <p className="mt-1 text-xs text-slate-500">
                Dominant shift time before departure (90-day lookback)
              </p>
              <table className="mt-4 w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-slate-500">
                    <th className="pb-2 font-medium">Shift</th>
                    <th className="pb-2 font-medium">Departures</th>
                    <th className="pb-2 text-right font-medium">Shifts worked</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {turnover.byShift.map((row) => (
                    <tr key={row.bucket}>
                      <td className="py-2 font-medium">{row.label}</td>
                      <td className={cn("py-2", row.departures >= 2 && "text-red-600 font-medium")}>
                        {row.departures}
                      </td>
                      <td className="py-2 text-right">{row.shiftCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {turnover.recentDepartures.length > 0 && (
            <div className="rounded-xl border bg-white p-4">
              <h3 className="font-semibold text-slate-900">Recent departures</h3>
              <ul className="mt-3 divide-y text-sm">
                {turnover.recentDepartures.map((d) => (
                  <li key={d.id} className="flex flex-wrap justify-between gap-2 py-3">
                    <div>
                      <span className="font-medium">{d.name}</span>
                      <span className="text-slate-500"> · {d.role}</span>
                      {d.reason && (
                        <p className="text-xs text-slate-500">{d.reason}</p>
                      )}
                    </div>
                    <div className="text-right text-slate-500">
                      <div>{format(new Date(d.terminatedAt), "MMM d, yyyy")}</div>
                      <div className="text-xs">{d.tenureDays} days tenure</div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <ShiftFeedbackModal
        open={!!feedbackModal}
        onClose={() => setFeedbackModal(null)}
        target={
          feedbackModal
            ? { staffMemberId: feedbackModal.staffMemberId, staffName: feedbackModal.staffName }
            : null
        }
        onSaved={loadFeedback}
      />
    </div>
  );
}
