"use client";

import { useCallback, useEffect, useState } from "react";
import { format, differenceInMinutes } from "date-fns";
import { Check, Clock, Edit2, MapPin, AlertCircle, ShieldCheck, Camera } from "lucide-react";
import { Button, Badge, EmptyState } from "@/components/ui";
import { Input, FormField } from "@/components/ui/form";
import { cn } from "@/lib/utils";

interface PunchEntry {
  id: string;
  staffMemberId: string;
  staffMember: { id: string; name: string; role: string };
  clockInAt: string;
  clockOutAt: string | null;
  geoVerifiedIn: boolean;
  geoVerifiedOut: boolean;
  identityVerifiedIn: boolean;
  identityVerifiedOut: boolean;
  identityMethodIn: string | null;
  clockInPhotoUrl: string | null;
  clockOutPhotoUrl: string | null;
  mealBreakTaken: boolean | null;
  restBreakTaken: boolean | null;
  notes: string | null;
  approvalStatus: string;
  approvedAt: string | null;
  editedAt: string | null;
  shift: { startTime: string; endTime: string; date: string } | null;
}

function toLocalInput(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatHours(clockInAt: string, clockOutAt: string | null) {
  if (!clockOutAt) return "—";
  const mins = differenceInMinutes(new Date(clockOutAt), new Date(clockInAt));
  if (mins < 1) return "<1m";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function TimePunchesPanel() {
  const [entries, setEntries] = useState<PunchEntry[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [filter, setFilter] = useState<"all" | "PENDING" | "APPROVED">("all");
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const [editing, setEditing] = useState<PunchEntry | null>(null);
  const [editForm, setEditForm] = useState({ clockInAt: "", clockOutAt: "", notes: "" });
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = filter === "all" ? "" : `?status=${filter}`;
      const res = await fetch(`/api/timeclock/entries${qs}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load punches");
      setEntries(data.entries ?? []);
      setPendingCount(data.pendingCount ?? 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  const approve = async (id: string) => {
    setActing(id);
    try {
      const res = await fetch(`/api/timeclock/entries/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Approve failed");
    } finally {
      setActing(null);
    }
  };

  const openEdit = (entry: PunchEntry) => {
    setEditing(entry);
    setEditForm({
      clockInAt: toLocalInput(entry.clockInAt),
      clockOutAt: entry.clockOutAt ? toLocalInput(entry.clockOutAt) : "",
      notes: entry.notes ?? "",
    });
  };

  const saveEdit = async () => {
    if (!editing) return;
    setActing(editing.id);
    try {
      const res = await fetch(`/api/timeclock/entries/${editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clockInAt: new Date(editForm.clockInAt).toISOString(),
          clockOutAt: editForm.clockOutAt ? new Date(editForm.clockOutAt).toISOString() : null,
          notes: editForm.notes,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setEditing(null);
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Save failed");
    } finally {
      setActing(null);
    }
  };

  if (loading) {
    return <p className="py-8 text-center text-slate-500">Loading time punches…</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Time punches</h2>
          <p className="text-sm text-slate-500">
            Review, approve, and correct clock in/out for payroll.
          </p>
        </div>
        {pendingCount > 0 && (
          <Badge className="bg-amber-100 text-amber-800">
            {pendingCount} awaiting approval
          </Badge>
        )}
      </div>

      <div className="flex gap-1 rounded-lg border bg-white p-1 w-fit">
        {(["all", "PENDING", "APPROVED"] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              filter === f ? "bg-orange-500 text-white" : "text-slate-600 hover:bg-slate-50"
            )}
          >
            {f === "all" ? "All" : f === "PENDING" ? "Pending" : "Approved"}
          </button>
        ))}
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {entries.length === 0 ? (
        <EmptyState
          icon={<Clock className="h-10 w-10" />}
          title="No punches yet"
          description="Employees clock in from the Time clock tab. Completed punches appear here for approval."
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-white">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b bg-slate-50 text-left text-slate-600">
                <th className="px-4 py-3 font-medium">Employee</th>
                <th className="px-4 py-3 font-medium">Verification</th>
                <th className="px-4 py-3 font-medium">Clock in</th>
                <th className="px-4 py-3 font-medium">Clock out</th>
                <th className="px-4 py-3 font-medium">Hours</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id} className="border-b last:border-0">
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-900">{e.staffMember.name}</p>
                    <p className="text-xs text-slate-500">{e.staffMember.role}</p>
                    {e.shift && (
                      <p className="mt-0.5 text-xs text-slate-400">
                        Scheduled {e.shift.startTime}–{e.shift.endTime}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-1">
                      {e.clockInPhotoUrl ? (
                        <a href={e.clockInPhotoUrl} target="_blank" rel="noreferrer">
                          <img
                            src={e.clockInPhotoUrl}
                            alt="Punch in"
                            className="h-10 w-10 rounded border object-cover"
                          />
                        </a>
                      ) : null}
                      <div className="flex flex-wrap gap-1 text-xs">
                        {e.identityVerifiedIn ? (
                          <span className="flex items-center gap-0.5 text-green-600">
                            <ShieldCheck className="h-3 w-3" />
                            {e.identityMethodIn === "BIOMETRIC" ? "Biometric" : "Photo"}
                          </span>
                        ) : (
                          <span className="text-amber-600">No ID proof</span>
                        )}
                        {e.geoVerifiedIn && (
                          <span className="flex items-center gap-0.5 text-green-600">
                            <MapPin className="h-3 w-3" /> GPS
                          </span>
                        )}
                        {!e.identityVerifiedIn && !e.geoVerifiedIn && (
                          <Camera className="h-3 w-3 text-slate-300" />
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    <p>{format(new Date(e.clockInAt), "MMM d, h:mm a")}</p>
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {e.clockOutAt ? (
                      <>
                        <p>{format(new Date(e.clockOutAt), "MMM d, h:mm a")}</p>
                        {e.geoVerifiedOut && (
                          <span className="flex items-center gap-0.5 text-xs text-green-600">
                            <MapPin className="h-3 w-3" /> Verified
                          </span>
                        )}
                      </>
                    ) : (
                      <Badge className="bg-green-100 text-green-800">On clock</Badge>
                    )}
                  </td>
                  <td className="px-4 py-3 tabular-nums text-slate-700">
                    {formatHours(e.clockInAt, e.clockOutAt)}
                  </td>
                  <td className="px-4 py-3">
                    {!e.clockOutAt ? (
                      <Badge className="bg-blue-100 text-blue-800">Open</Badge>
                    ) : e.approvalStatus === "APPROVED" ? (
                      <Badge className="bg-green-100 text-green-800">Approved</Badge>
                    ) : (
                      <Badge className="bg-amber-100 text-amber-800">Pending</Badge>
                    )}
                    {e.editedAt && (
                      <p className="mt-0.5 text-xs text-slate-400">Edited</p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      {e.clockOutAt && e.approvalStatus !== "APPROVED" && (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => approve(e.id)}
                          disabled={acting === e.id}
                        >
                          <Check className="mr-1 h-3 w-3" />
                          Approve
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => openEdit(e)}
                        disabled={acting === e.id}
                      >
                        <Edit2 className="mr-1 h-3 w-3" />
                        Edit
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-slate-900">Edit punch — {editing.staffMember.name}</h3>
            <div className="mt-4 space-y-3">
              <FormField label="Clock in">
                <Input
                  type="datetime-local"
                  value={editForm.clockInAt}
                  onChange={(ev) => setEditForm((f) => ({ ...f, clockInAt: ev.target.value }))}
                />
              </FormField>
              <FormField label="Clock out">
                <Input
                  type="datetime-local"
                  value={editForm.clockOutAt}
                  onChange={(ev) => setEditForm((f) => ({ ...f, clockOutAt: ev.target.value }))}
                />
              </FormField>
              <FormField label="Manager notes">
                <Input
                  value={editForm.notes}
                  onChange={(ev) => setEditForm((f) => ({ ...f, notes: ev.target.value }))}
                  placeholder="Reason for adjustment…"
                />
              </FormField>
            </div>
            <div className="mt-6 flex gap-2">
              <Button variant="secondary" className="flex-1" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button className="flex-1" onClick={saveEdit} disabled={acting === editing.id}>
                {acting === editing.id ? "Saving…" : "Save changes"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
