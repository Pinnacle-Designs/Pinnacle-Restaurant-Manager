"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Banknote,
  Calculator,
  Coins,
  Settings2,
  Wallet,
  Users,
} from "lucide-react";
import { Button, Badge, EmptyState } from "@/components/ui";
import { Input, Select, FormField } from "@/components/ui/form";
import { apiPost } from "@/lib/api";
import { ForgottenClockOutAlert } from "@/components/staff/ForgottenClockOutAlert";
import { formatCurrency, cn } from "@/lib/utils";
import { JOB_ROLES, TIPPED_JOB_ROLES } from "@/lib/payroll/job-roles";
import { getDefaultPayPeriod } from "@/lib/payroll/compute";
import type { PayrollPreview } from "@/lib/payroll/types";

interface StaffMember {
  id: string;
  name: string;
  role: string;
  hourlyRate?: number;
  isTippedEmployee?: boolean;
  tipPoints?: number;
  active: boolean;
}

interface RoleRate {
  role: string;
  hourlyRate: number;
  tipPoints: number;
  isTippedRole: boolean;
}

interface PayrollSettings {
  minimumWage: number;
  tipCredit: number;
  tippedMinCashWage: number;
  weeklyOtThresholdHours: number;
  dailyOtThresholdHours: number | null;
  otMultiplier: number;
  useBlendedOtRate: boolean;
  splitShiftEnabled: boolean;
  splitShiftPremiumHours: number;
  splitShiftMinGapMinutes: number;
  tipPoolMode: string;
  tipPoolRoles: string[] | null;
  ewaEnabled: boolean;
  ewaMaxPercent: number;
  ewaMaxPerAdvance: number;
  ewaFeeFlat: number;
  payPeriodDays: number;
}

type Section = "preview" | "tips" | "rates" | "ewa" | "settings";

export function PayrollClient({ staff }: { staff: StaffMember[] }) {
  const [section, setSection] = useState<Section>("preview");
  const [settings, setSettings] = useState<PayrollSettings | null>(null);
  const [preview, setPreview] = useState<PayrollPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [selectedStaffId, setSelectedStaffId] = useState(staff[0]?.id ?? "");
  const [roleRates, setRoleRates] = useState<RoleRate[]>([]);

  const activeStaff = staff.filter((s) => s.active);

  const initPeriod = useCallback(() => {
    const { start, end } = getDefaultPayPeriod();
    setPeriodStart(start.toISOString().slice(0, 10));
    setPeriodEnd(end.toISOString().slice(0, 10));
  }, []);

  const loadSettings = useCallback(async () => {
    const res = await fetch("/api/payroll/settings");
    if (!res.ok) throw new Error("Failed to load payroll settings");
    setSettings(await res.json());
  }, []);

  const loadPreview = useCallback(async () => {
    if (!periodStart || !periodEnd) return;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/payroll/preview?periodStart=${periodStart}&periodEnd=${periodEnd}T23:59:59.999Z`
      );
      if (!res.ok) throw new Error("Failed to compute payroll");
      setPreview(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Preview failed");
    } finally {
      setLoading(false);
    }
  }, [periodStart, periodEnd]);

  const loadRoleRates = useCallback(async (staffId: string) => {
    if (!staffId) return;
    const res = await fetch(`/api/payroll/staff/${staffId}/rates`);
    if (res.ok) {
      setRoleRates(await res.json());
    }
  }, []);

  useEffect(() => {
    initPeriod();
    loadSettings().catch(() => setError("Could not load payroll settings"));
  }, [initPeriod, loadSettings]);

  useEffect(() => {
    if (periodStart && periodEnd) loadPreview();
  }, [periodStart, periodEnd, loadPreview]);

  useEffect(() => {
    if (selectedStaffId) loadRoleRates(selectedStaffId);
  }, [selectedStaffId, loadRoleRates]);

  const saveSettings = async () => {
    if (!settings) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/payroll/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      if (!res.ok) throw new Error("Failed to save settings");
      setSettings(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const runTipPool = async () => {
    setSaving(true);
    try {
      await apiPost("/api/payroll/tips", {
        periodStart: `${periodStart}T00:00:00.000Z`,
        periodEnd: `${periodEnd}T23:59:59.999Z`,
      });
      await loadPreview();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Tip pool failed");
    } finally {
      setSaving(false);
    }
  };

  const createPayrollRun = async () => {
    setSaving(true);
    try {
      await apiPost("/api/payroll/runs", {
        periodStart: `${periodStart}T00:00:00.000Z`,
        periodEnd: `${periodEnd}T23:59:59.999Z`,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Payroll run failed");
    } finally {
      setSaving(false);
    }
  };

  const saveRoleRates = async () => {
    if (!selectedStaffId) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/payroll/staff/${selectedStaffId}/rates`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rates: roleRates }),
      });
      if (!res.ok) throw new Error("Failed to save rates");
      setRoleRates(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save rates");
    } finally {
      setSaving(false);
    }
  };

  const addRoleRate = () => {
    const member = activeStaff.find((s) => s.id === selectedStaffId);
    setRoleRates([
      ...roleRates,
      {
        role: member?.role ?? "Server",
        hourlyRate: member?.hourlyRate ?? 0,
        tipPoints: 1,
        isTippedRole: TIPPED_JOB_ROLES.has((member?.role ?? "Server") as never),
      },
    ]);
  };

  const sections: { id: Section; label: string; icon: typeof Calculator }[] = [
    { id: "preview", label: "Pay preview", icon: Calculator },
    { id: "tips", label: "Tip pooling", icon: Coins },
    { id: "rates", label: "Dual-role rates", icon: Users },
    { id: "ewa", label: "On-demand pay", icon: Wallet },
    { id: "settings", label: "Rules", icon: Settings2 },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-1 rounded-lg border bg-white p-1">
        {sections.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setSection(id)}
            className={cn(
              "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              section === id ? "bg-orange-500 text-white" : "text-slate-600 hover:bg-slate-50"
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-xl border bg-white p-4">
        <FormField label="Period start">
          <Input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
        </FormField>
        <FormField label="Period end">
          <Input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
        </FormField>
        <Button variant="secondary" onClick={loadPreview} disabled={loading}>
          Recalculate
        </Button>
      </div>

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {section === "preview" && (
        <div className="space-y-4">
          <ForgottenClockOutAlert variant="banner" />
          {loading || !preview ? (
            <p className="text-sm text-slate-500">Calculating payroll…</p>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Stat label="Gross payroll" value={formatCurrency(preview.totals.grossPay)} />
                <Stat label="Tips in period" value={formatCurrency(preview.totals.tips)} />
                <Stat label="Overtime pay" value={formatCurrency(preview.totals.overtimePay)} />
                <Stat label="Tip credit makeup" value={formatCurrency(preview.totals.tipCreditMakeup)} />
              </div>
              <div className="overflow-x-auto rounded-xl border bg-white">
                <table className="min-w-full text-sm">
                  <thead className="border-b bg-slate-50 text-left text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-4 py-3">Employee</th>
                      <th className="px-4 py-3">Reg hrs</th>
                      <th className="px-4 py-3">OT hrs</th>
                      <th className="px-4 py-3">Base pay</th>
                      <th className="px-4 py-3">OT pay</th>
                      <th className="px-4 py-3">Split-shift</th>
                      <th className="px-4 py-3">Tips</th>
                      <th className="px-4 py-3">Makeup</th>
                      <th className="px-4 py-3">Gross</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.employees.map((row) => (
                      <tr key={row.staffMemberId} className="border-b last:border-0">
                        <td className="px-4 py-3 font-medium">{row.name}</td>
                        <td className="px-4 py-3">{row.regularHours.toFixed(1)}</td>
                        <td className="px-4 py-3">{row.overtimeHours.toFixed(1)}</td>
                        <td className="px-4 py-3">{formatCurrency(row.regularPay)}</td>
                        <td className="px-4 py-3">{formatCurrency(row.overtimePay)}</td>
                        <td className="px-4 py-3">{formatCurrency(row.splitShiftPay)}</td>
                        <td className="px-4 py-3">{formatCurrency(row.tipsAllocated)}</td>
                        <td className="px-4 py-3">{formatCurrency(row.tipCreditMakeup)}</td>
                        <td className="px-4 py-3 font-semibold">{formatCurrency(row.grossPay)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex gap-2">
                <Button onClick={createPayrollRun} disabled={saving}>
                  <Banknote className="h-4 w-4" />
                  Create pay run draft
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      {section === "tips" && preview && (
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Mode: <Badge>{preview.tipPoolMode.replace("_", " ")}</Badge> · Total tips{" "}
            {formatCurrency(preview.totalTips)}
          </p>
          <div className="overflow-x-auto rounded-xl border bg-white">
            <table className="min-w-full text-sm">
              <thead className="border-b bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Employee</th>
                  <th className="px-4 py-3">Hours</th>
                  <th className="px-4 py-3">Points</th>
                  <th className="px-4 py-3">Share</th>
                  <th className="px-4 py-3">Tips</th>
                  <th className="px-4 py-3">Min-wage makeup</th>
                </tr>
              </thead>
              <tbody>
                {preview.tipAllocations
                  .filter((a) => a.tipsAmount > 0 || a.tipCreditMakeup > 0)
                  .map((row) => (
                    <tr key={row.staffMemberId} className="border-b last:border-0">
                      <td className="px-4 py-3 font-medium">{row.name}</td>
                      <td className="px-4 py-3">{row.hoursWorked.toFixed(1)}</td>
                      <td className="px-4 py-3">{row.tipPoints}</td>
                      <td className="px-4 py-3">{row.sharePercent.toFixed(1)}%</td>
                      <td className="px-4 py-3">{formatCurrency(row.tipsAmount)}</td>
                      <td className="px-4 py-3">{formatCurrency(row.tipCreditMakeup)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          <Button onClick={runTipPool} disabled={saving}>
            Finalize tip pool for period
          </Button>
        </div>
      )}

      {section === "rates" && (
        <div className="space-y-4">
          <FormField label="Employee">
            <Select
              value={selectedStaffId}
              onChange={(e) => setSelectedStaffId(e.target.value)}
            >
              {activeStaff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.role})
                </option>
              ))}
            </Select>
          </FormField>
          <p className="text-sm text-slate-600">
            Set different hourly rates per role when an employee works multiple jobs (e.g. Server vs
            Host). Assign the shift role on the schedule to apply the correct rate.
          </p>
          <div className="space-y-3">
            {roleRates.map((rate, idx) => (
              <div key={idx} className="grid gap-3 rounded-lg border p-4 sm:grid-cols-4">
                <FormField label="Role">
                  <Select
                    value={rate.role}
                    onChange={(e) => {
                      const next = [...roleRates];
                      next[idx] = { ...rate, role: e.target.value };
                      setRoleRates(next);
                    }}
                  >
                    {JOB_ROLES.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </Select>
                </FormField>
                <FormField label="Hourly rate">
                  <Input
                    type="number"
                    step="0.01"
                    value={rate.hourlyRate}
                    onChange={(e) => {
                      const next = [...roleRates];
                      next[idx] = { ...rate, hourlyRate: parseFloat(e.target.value) || 0 };
                      setRoleRates(next);
                    }}
                  />
                </FormField>
                <FormField label="Tip points">
                  <Input
                    type="number"
                    step="0.1"
                    value={rate.tipPoints}
                    onChange={(e) => {
                      const next = [...roleRates];
                      next[idx] = { ...rate, tipPoints: parseFloat(e.target.value) || 1 };
                      setRoleRates(next);
                    }}
                  />
                </FormField>
                <FormField label="Tipped role">
                  <Select
                    value={rate.isTippedRole ? "yes" : "no"}
                    onChange={(e) => {
                      const next = [...roleRates];
                      next[idx] = { ...rate, isTippedRole: e.target.value === "yes" };
                      setRoleRates(next);
                    }}
                  >
                    <option value="yes">Yes</option>
                    <option value="no">No</option>
                  </Select>
                </FormField>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={addRoleRate}>
              Add role rate
            </Button>
            <Button onClick={saveRoleRates} disabled={saving}>
              Save rates
            </Button>
          </div>
        </div>
      )}

      {section === "ewa" && settings && <EwaPanel enabled={settings.ewaEnabled} />}

      {section === "settings" && settings && (
        <div className="grid gap-4 lg:grid-cols-2">
          <SettingsCard title="Wage compliance">
            <NumberField
              label="Minimum wage"
              value={settings.minimumWage}
              onChange={(v) => setSettings({ ...settings, minimumWage: v })}
            />
            <NumberField
              label="Tipped min cash wage"
              value={settings.tippedMinCashWage}
              onChange={(v) => setSettings({ ...settings, tippedMinCashWage: v })}
            />
            <NumberField
              label="Max tip credit"
              value={settings.tipCredit}
              onChange={(v) => setSettings({ ...settings, tipCredit: v })}
            />
          </SettingsCard>
          <SettingsCard title="Overtime">
            <NumberField
              label="Weekly OT threshold (hrs)"
              value={settings.weeklyOtThresholdHours}
              onChange={(v) => setSettings({ ...settings, weeklyOtThresholdHours: v })}
            />
            <FormField label="Daily OT threshold (hrs, optional)">
              <Input
                type="number"
                step="0.5"
                value={settings.dailyOtThresholdHours ?? ""}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    dailyOtThresholdHours:
                      e.target.value === "" ? null : parseFloat(e.target.value) || null,
                  })
                }
              />
            </FormField>
            <NumberField
              label="OT multiplier"
              value={settings.otMultiplier}
              onChange={(v) => setSettings({ ...settings, otMultiplier: v })}
            />
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={settings.useBlendedOtRate}
                onChange={(e) =>
                  setSettings({ ...settings, useBlendedOtRate: e.target.checked })
                }
              />
              Use blended OT rate (FLSA weighted average)
            </label>
          </SettingsCard>
          <SettingsCard title="Split-shift premium">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={settings.splitShiftEnabled}
                onChange={(e) =>
                  setSettings({ ...settings, splitShiftEnabled: e.target.checked })
                }
              />
              Enable split-shift premium
            </label>
            <NumberField
              label="Premium hours at min wage"
              value={settings.splitShiftPremiumHours}
              onChange={(v) => setSettings({ ...settings, splitShiftPremiumHours: v })}
            />
            <NumberField
              label="Min gap between shifts (minutes)"
              value={settings.splitShiftMinGapMinutes}
              onChange={(v) => setSettings({ ...settings, splitShiftMinGapMinutes: v })}
            />
          </SettingsCard>
          <SettingsCard title="Tip pooling">
            <FormField label="Pool mode">
              <Select
                value={settings.tipPoolMode}
                onChange={(e) => setSettings({ ...settings, tipPoolMode: e.target.value })}
              >
                <option value="INDIVIDUAL">Individual (server keeps own tips)</option>
                <option value="FULL_POOL">Full pool (by hours)</option>
                <option value="POINTS">Points-weighted pool</option>
                <option value="ROLE_WEIGHTED">Role-weighted pool</option>
              </Select>
            </FormField>
          </SettingsCard>
          <SettingsCard title="Earned wage access (EWA)">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={settings.ewaEnabled}
                onChange={(e) => setSettings({ ...settings, ewaEnabled: e.target.checked })}
              />
              Enable on-demand pay
            </label>
            <NumberField
              label="Max % of earned wages"
              value={settings.ewaMaxPercent}
              onChange={(v) => setSettings({ ...settings, ewaMaxPercent: v })}
            />
            <NumberField
              label="Max per advance ($)"
              value={settings.ewaMaxPerAdvance}
              onChange={(v) => setSettings({ ...settings, ewaMaxPerAdvance: v })}
            />
          </SettingsCard>
          <div className="lg:col-span-2">
            <Button onClick={saveSettings} disabled={saving}>
              Save payroll rules
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-white p-4">
      <p className="text-xs font-medium uppercase text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-bold text-slate-900">{value}</p>
    </div>
  );
}

function SettingsCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3 rounded-xl border bg-white p-4">
      <h3 className="font-semibold text-slate-900">{title}</h3>
      {children}
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | string;
  onChange: (v: number) => void;
}) {
  return (
    <FormField label={label}>
      <Input
        type="number"
        step="0.01"
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
      />
    </FormField>
  );
}

function EwaPanel({ enabled }: { enabled: boolean }) {
  const [data, setData] = useState<{
    availability?: {
      earnedToDate: number;
      availableAmount: number;
      advancesPending: number;
    };
    advances?: { id: string; amount: number; status: string; staffMember: { name: string } }[];
  } | null>(null);

  useEffect(() => {
    fetch("/api/payroll/ewa")
      .then((r) => r.json())
      .then(setData)
      .catch(() => {});
  }, []);

  if (!enabled) {
    return (
      <EmptyState
        icon={<Wallet className="h-12 w-12" />}
        title="On-demand pay is off"
        description="Enable earned wage access in Payroll → Rules so staff can access earned wages before payday."
      />
    );
  }

  return (
    <div className="space-y-4">
      {data?.availability && (
        <div className="grid gap-3 sm:grid-cols-3">
          <Stat label="Earned this period" value={formatCurrency(data.availability.earnedToDate)} />
          <Stat
            label="Available advance"
            value={formatCurrency(data.availability.availableAmount)}
          />
          <Stat
            label="Pending advances"
            value={formatCurrency(data.availability.advancesPending)}
          />
        </div>
      )}
      {data?.advances && data.advances.length > 0 && (
        <div className="rounded-xl border bg-white divide-y">
          {data.advances.map((a) => (
            <div key={a.id} className="flex items-center justify-between px-4 py-3 text-sm">
              <span>
                {a.staffMember.name} · {formatCurrency(a.amount)}
              </span>
              <Badge>{a.status}</Badge>
            </div>
          ))}
        </div>
      )}
      <p className="text-sm text-slate-500">
        Staff with the &quot;Request earned wage access&quot; permission can request advances from
        their account. Advances are deducted on the next finalized pay run.
      </p>
    </div>
  );
}
