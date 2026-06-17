"use client";

import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import {
  AlertTriangle,
  ClipboardList,
  Download,
  FileArchive,
  Plus,
  Shield,
  ShieldAlert,
} from "lucide-react";
import { Button, EmptyState } from "@/components/ui";
import { PrintButton } from "@/components/ui/PrintButton";
import { Input, Select, FormField, Modal, Textarea } from "@/components/ui/form";
import { cn } from "@/lib/utils";
import { INCIDENT_CATEGORIES } from "@/lib/compliance/minor-labor";

type Section = "guardrails" | "incidents" | "audit";

interface StaffOption {
  id: string;
  name: string;
  role: string;
}

interface MinorViolation {
  shiftId: string;
  staffName: string;
  shiftDate: string;
  code: string;
  message: string;
  severity: string;
}

interface Incident {
  id: string;
  reportedAt: string;
  incidentType: string;
  category: string;
  description: string;
  severity: string;
  oshaRecordable: boolean;
  status: string;
  staffMember?: { name: string } | null;
  guestName: string | null;
  actionTaken: string | null;
}

export function ComplianceClient({ staff }: { staff: StaffOption[] }) {
  const [section, setSection] = useState<Section>("guardrails");
  const [loading, setLoading] = useState(true);
  const [dashboard, setDashboard] = useState<{
    settings: {
      minorBlockScheduling: boolean;
      minorBlockTimeClock?: boolean;
      minorSchoolNightEndHour: number;
      minorMaxWeeklyHoursSchool: number;
      minorMaxDailyHoursSchool: number;
      schoolCalendarActive: boolean;
      minorAlertMinutesBefore?: number;
      managerAlertPhone?: string | null;
      requireTipDeclaration?: boolean;
    };
    breakSettings?: {
      mealBreakRequiredAfterHours: number;
      mealBreakAlertMinutes: number;
      mealBreakMinutes: number;
    };
    summary: {
      minorViolationsThisWeek: number;
      openIncidents: number;
      oshaRecordable12Mo: number;
      archivedShifts: number;
      archivedTimecards: number;
      archivedPayrollRuns: number;
    };
    minorViolations: MinorViolation[];
  } | null>(null);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [auditFrom, setAuditFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 90);
    return d.toISOString().slice(0, 10);
  });
  const [auditTo, setAuditTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [auditData, setAuditData] = useState<Record<string, unknown> | null>(null);
  const [incidentOpen, setIncidentOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [incidentForm, setIncidentForm] = useState({
    incidentType: "WORKPLACE_INJURY",
    category: "burn",
    description: "",
    staffMemberId: "",
    guestName: "",
    severity: "MEDIUM",
    oshaRecordable: false,
    actionTaken: "",
    witnessNotes: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [dashRes, incRes] = await Promise.all([
        fetch("/api/compliance"),
        fetch("/api/compliance/incidents"),
      ]);
      setDashboard(await dashRes.json());
      const incData = await incRes.json();
      setIncidents(incData.incidents || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const saveSettings = async (
    patch: Partial<NonNullable<typeof dashboard>["settings"]> & {
      mealBreakRequiredAfterHours?: number;
      mealBreakAlertMinutes?: number;
    }
  ) => {
    if (!dashboard) return;
    await fetch("/api/compliance", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...dashboard.settings, ...patch }),
    });
    await load();
  };

  const logIncident = async () => {
    setSaving(true);
    try {
      await fetch("/api/compliance/incidents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(incidentForm),
      });
      setIncidentOpen(false);
      setIncidentForm({
        incidentType: "WORKPLACE_INJURY",
        category: "burn",
        description: "",
        staffMemberId: "",
        guestName: "",
        severity: "MEDIUM",
        oshaRecordable: false,
        actionTaken: "",
        witnessNotes: "",
      });
      await load();
    } finally {
      setSaving(false);
    }
  };

  const loadAudit = async () => {
    setSaving(true);
    try {
      const res = await fetch(
        `/api/compliance/audit-records?from=${auditFrom}&to=${auditTo}T23:59:59`
      );
      setAuditData(await res.json());
    } finally {
      setSaving(false);
    }
  };

  const exportAudit = () => {
    if (!auditData) return;
    const blob = new Blob([JSON.stringify(auditData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pinnacle-audit-${auditFrom}-to-${auditTo}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const categories =
    INCIDENT_CATEGORIES[incidentForm.incidentType as keyof typeof INCIDENT_CATEGORIES] ?? [];

  if (loading || !dashboard) {
    return <p className="text-center text-slate-500 py-8">Loading compliance…</p>;
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-4">
        <p className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <Shield className="h-4 w-4 text-amber-600" />
          Labor law & compliance guardrails
        </p>
        <p className="mt-1 text-sm text-slate-600">
          Minor scheduling blocks, OSHA incident logbook, and audit-ready archives of schedules,
          timecards, and payroll — centralized for labor department reviews.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        {[
          { label: "Minor issues (week)", value: dashboard.summary.minorViolationsThisWeek, tone: "text-amber-600" },
          { label: "Open incidents", value: dashboard.summary.openIncidents, tone: "text-red-600" },
          { label: "OSHA recordable (12 mo)", value: dashboard.summary.oshaRecordable12Mo, tone: "text-slate-800" },
          { label: "Archived timecards", value: dashboard.summary.archivedTimecards, tone: "text-slate-600" },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border bg-white p-4 text-center">
            <p className={cn("text-2xl font-bold", s.tone)}>{s.value}</p>
            <p className="text-xs text-slate-500">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="no-print flex flex-wrap gap-2">
        {(
          [
            ["guardrails", "Minor labor", ShieldAlert],
            ["incidents", "Incidents", ClipboardList],
            ["audit", "Audit records", FileArchive],
          ] as const
        ).map(([id, label, Icon]) => (
          <button
            key={id}
            type="button"
            onClick={() => setSection(id)}
            className={cn(
              "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium",
              section === id ? "bg-orange-500 text-white" : "bg-white border text-slate-600 hover:bg-slate-50"
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {section === "guardrails" && (
        <div className="space-y-4">
          <div className="rounded-xl border bg-white p-4">
            <h3 className="text-sm font-semibold text-slate-900">Minor labor rules</h3>
            <p className="mt-1 text-xs text-slate-500">
              Set date of birth on team members under 18. Violations block scheduling when enabled.
            </p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <FormField label="Block illegal minor shifts">
                <Select
                  value={dashboard.settings.minorBlockScheduling ? "block" : "warn"}
                  onChange={(e) =>
                    saveSettings({ minorBlockScheduling: e.target.value === "block" })
                  }
                >
                  <option value="block">Block schedule save</option>
                  <option value="warn">Warn only</option>
                </Select>
              </FormField>
              <FormField label="School night curfew (end by)">
                <Select
                  value={String(dashboard.settings.minorSchoolNightEndHour)}
                  onChange={(e) =>
                    saveSettings({ minorSchoolNightEndHour: Number(e.target.value) })
                  }
                >
                  <option value="19">7:00 PM</option>
                  <option value="21">9:00 PM</option>
                  <option value="22">10:00 PM</option>
                  <option value="23">11:00 PM</option>
                </Select>
              </FormField>
              <FormField label="Block illegal punches (time clock)">
                <Select
                  value={dashboard.settings.minorBlockTimeClock !== false ? "block" : "warn"}
                  onChange={(e) =>
                    saveSettings({ minorBlockTimeClock: e.target.value === "block" })
                  }
                >
                  <option value="block">Block clock in/out</option>
                  <option value="warn">Warn only</option>
                </Select>
              </FormField>
              <FormField label="SMS alert minutes before violation">
                <Input
                  type="number"
                  min={5}
                  max={120}
                  value={dashboard.settings.minorAlertMinutesBefore ?? 30}
                  onChange={(e) =>
                    saveSettings({ minorAlertMinutesBefore: Number(e.target.value) })
                  }
                />
              </FormField>
              <FormField label="Manager alert phone (SMS)">
                <Input
                  type="tel"
                  placeholder="+15551234567"
                  value={dashboard.settings.managerAlertPhone ?? ""}
                  onChange={(e) => saveSettings({ managerAlertPhone: e.target.value || null })}
                />
              </FormField>
              <FormField label="Require tip declaration at clock out">
                <Select
                  value={dashboard.settings.requireTipDeclaration !== false ? "yes" : "no"}
                  onChange={(e) =>
                    saveSettings({ requireTipDeclaration: e.target.value === "yes" })
                  }
                >
                  <option value="yes">Required for tipped roles</option>
                  <option value="no">Optional</option>
                </Select>
              </FormField>
              <FormField label="Max hours / school week">
                <Input
                  type="number"
                  value={dashboard.settings.minorMaxWeeklyHoursSchool}
                  onChange={(e) =>
                    saveSettings({ minorMaxWeeklyHoursSchool: Number(e.target.value) })
                  }
                />
              </FormField>
            </div>
          </div>

          <div className="rounded-xl border bg-white p-4">
            <h3 className="text-sm font-semibold text-slate-900">Meal break enforcement</h3>
            <p className="mt-1 text-xs text-slate-500">
              Managers are alerted before required breaks. Skipping a break at clock-out requires a
              digital waiver stored on the timecard.
            </p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <FormField label="Break required after (hours)">
                <Input
                  type="number"
                  step="0.5"
                  min={4}
                  max={8}
                  value={dashboard.breakSettings?.mealBreakRequiredAfterHours ?? 5}
                  onChange={(e) =>
                    saveSettings({ mealBreakRequiredAfterHours: Number(e.target.value) })
                  }
                />
              </FormField>
              <FormField label="Manager alert (minutes before)">
                <Input
                  type="number"
                  min={5}
                  max={60}
                  value={dashboard.breakSettings?.mealBreakAlertMinutes ?? 15}
                  onChange={(e) =>
                    saveSettings({ mealBreakAlertMinutes: Number(e.target.value) })
                  }
                />
              </FormField>
            </div>
          </div>

          {dashboard.minorViolations.length === 0 ? (
            <EmptyState
              icon={<Shield className="h-12 w-12" />}
              title="No minor violations this week"
              description="Schedules for employees under 18 comply with current guardrails."
            />
          ) : (
            <ul className="divide-y rounded-xl border bg-white">
              {dashboard.minorViolations.map((v, i) => (
                <li key={`${v.shiftId}-${i}`} className="flex flex-wrap items-center gap-3 p-4 text-sm">
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                  <span className="font-medium">{v.staffName}</span>
                  <span className="text-slate-500">
                    {v.shiftDate ? format(new Date(v.shiftDate), "EEE MMM d") : ""}
                  </span>
                  <span className="text-slate-700">{v.message}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {section === "incidents" && (
        <div>
          <div className="mb-3 flex justify-end">
            <Button onClick={() => setIncidentOpen(true)}>
              <Plus className="h-4 w-4" />
              Log incident
            </Button>
          </div>
          {incidents.length === 0 ? (
            <EmptyState
              icon={<ClipboardList className="h-12 w-12" />}
              title="No incidents logged"
              description="Record burns, cuts, slips, and guest incidents for OSHA and liability records."
            />
          ) : (
            <ul className="divide-y rounded-xl border bg-white">
              {incidents.map((inc) => (
                <li key={inc.id} className="p-4 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-slate-900">
                      {inc.incidentType.replace("_", " ")}
                    </span>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs">
                      {inc.category.replace("_", " ")}
                    </span>
                    <span className="text-xs text-slate-400">
                      {format(new Date(inc.reportedAt), "MMM d, yyyy h:mm a")}
                    </span>
                    {inc.oshaRecordable && (
                      <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">
                        OSHA recordable
                      </span>
                    )}
                    <span className="ml-auto text-xs uppercase text-slate-500">{inc.status}</span>
                  </div>
                  <p className="mt-2 text-slate-700">{inc.description}</p>
                  {(inc.staffMember?.name || inc.guestName) && (
                    <p className="mt-1 text-xs text-slate-500">
                      {inc.staffMember?.name ? `Staff: ${inc.staffMember.name}` : `Guest: ${inc.guestName}`}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {section === "audit" && (
        <div className="space-y-4 rounded-xl border bg-white p-4">
          <h3 className="text-sm font-semibold text-slate-900">Audit-ready records</h3>
          <p className="text-sm text-slate-600">
            Pull schedules, timecards, and payroll runs for any date range. Export JSON for labor
            department or counsel.
          </p>
          <div className="no-print flex flex-wrap items-end gap-3">
            <FormField label="From">
              <Input type="date" value={auditFrom} onChange={(e) => setAuditFrom(e.target.value)} />
            </FormField>
            <FormField label="To">
              <Input type="date" value={auditTo} onChange={(e) => setAuditTo(e.target.value)} />
            </FormField>
            <Button onClick={loadAudit} disabled={saving}>
              Load records
            </Button>
            {auditData && (
              <>
                <PrintButton reportTitle="Compliance audit records" label="Print" />
                <Button variant="secondary" onClick={exportAudit}>
                  <Download className="h-4 w-4" />
                  Export JSON
                </Button>
              </>
            )}
          </div>
          {auditData && (
            <div className="grid gap-3 sm:grid-cols-3 text-center text-sm">
              <div className="rounded-lg bg-slate-50 p-3">
                <p className="text-lg font-bold">{(auditData.summary as { shifts: number }).shifts}</p>
                <p className="text-slate-500">Shifts</p>
              </div>
              <div className="rounded-lg bg-slate-50 p-3">
                <p className="text-lg font-bold">{(auditData.summary as { timecards: number }).timecards}</p>
                <p className="text-slate-500">Timecards</p>
              </div>
              <div className="rounded-lg bg-slate-50 p-3">
                <p className="text-lg font-bold">{(auditData.summary as { payrollRuns: number }).payrollRuns}</p>
                <p className="text-slate-500">Payroll runs</p>
              </div>
            </div>
          )}
        </div>
      )}

      <Modal open={incidentOpen} onClose={() => setIncidentOpen(false)} title="Log incident">
        <div className="space-y-4">
          <FormField label="Type">
            <Select
              value={incidentForm.incidentType}
              onChange={(e) =>
                setIncidentForm({
                  ...incidentForm,
                  incidentType: e.target.value,
                  category: INCIDENT_CATEGORIES[e.target.value as keyof typeof INCIDENT_CATEGORIES][0].value,
                })
              }
            >
              <option value="WORKPLACE_INJURY">Workplace injury</option>
              <option value="GUEST_INCIDENT">Guest incident</option>
              <option value="NEAR_MISS">Near miss</option>
            </Select>
          </FormField>
          <FormField label="Category">
            <Select
              value={incidentForm.category}
              onChange={(e) => setIncidentForm({ ...incidentForm, category: e.target.value })}
            >
              {categories.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Description">
            <Textarea
              rows={3}
              value={incidentForm.description}
              onChange={(e) => setIncidentForm({ ...incidentForm, description: e.target.value })}
            />
          </FormField>
          {incidentForm.incidentType === "WORKPLACE_INJURY" && (
            <FormField label="Staff involved">
              <Select
                value={incidentForm.staffMemberId}
                onChange={(e) => setIncidentForm({ ...incidentForm, staffMemberId: e.target.value })}
              >
                <option value="">—</option>
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </FormField>
          )}
          {incidentForm.incidentType === "GUEST_INCIDENT" && (
            <FormField label="Guest name">
              <Input
                value={incidentForm.guestName}
                onChange={(e) => setIncidentForm({ ...incidentForm, guestName: e.target.value })}
              />
            </FormField>
          )}
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={incidentForm.oshaRecordable}
              onChange={(e) => setIncidentForm({ ...incidentForm, oshaRecordable: e.target.checked })}
            />
            OSHA recordable
          </label>
          <Button className="w-full" disabled={saving} onClick={logIncident}>
            Save to logbook
          </Button>
        </div>
      </Modal>
    </div>
  );
}
