"use client";

import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import {
  AlertTriangle,
  Award,
  BookOpen,
  CheckCircle2,
  ClipboardCheck,
  Plus,
  Shield,
  Trash2,
} from "lucide-react";
import { Button, EmptyState } from "@/components/ui";
import { Input, Select, FormField, Modal } from "@/components/ui/form";
import { cn } from "@/lib/utils";
import { useAuth } from "@/components/auth/AuthProvider";
import { MyTrainingPanel } from "@/components/staff/MyTrainingPanel";

interface StaffOption {
  id: string;
  name: string;
  role: string;
}

interface CertType {
  key: string;
  label: string;
  defaultValidityMonths: number | null;
  auditCritical: boolean;
}

interface Certification {
  id: string;
  staffMemberId: string;
  certType: string;
  issuer: string | null;
  certificateNumber: string | null;
  issuedAt: string | null;
  expiresAt: string | null;
  staffMember: { name: string; role: string };
}

interface Alert {
  id: string;
  staffName: string;
  staffRole: string;
  certLabel: string;
  level: "EXPIRED" | "EXPIRING" | "MISSING" | "OK";
  expiresAt: string | null;
  daysUntilExpiry: number | null;
  auditCritical: boolean;
}

interface TrainingGap {
  staffName: string;
  moduleTitle: string;
  reason: string;
}

type Section = "alerts" | "certifications" | "modules" | "mine";

const ALERT_STYLES = {
  EXPIRED: "bg-red-100 text-red-800",
  EXPIRING: "bg-amber-100 text-amber-800",
  MISSING: "bg-slate-200 text-slate-800",
  OK: "bg-green-100 text-green-800",
};

export function TrainingClient({ staff }: { staff: StaffOption[] }) {
  const { can } = useAuth();
  const canManage = can("manage_training");
  const canComplete = can("complete_training");

  const [section, setSection] = useState<Section>(canManage ? "alerts" : "mine");
  const [loading, setLoading] = useState(canManage);
  const [data, setData] = useState<{
    alerts: Alert[];
    trainingGaps: TrainingGap[];
    certifications: Certification[];
    certTypes: CertType[];
    settings: { expirationWarnDays: number };
    summary: { expiredCerts: number; expiringCerts: number; missingCerts: number; trainingGaps: number };
    modules: { id: string; title: string; required: boolean; kind: string; estimatedMinutes: number }[];
  } | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    staffMemberId: staff[0]?.id ?? "",
    certType: "food_handler_card",
    issuer: "",
    certificateNumber: "",
    issuedAt: new Date().toISOString().slice(0, 10),
    expiresAt: "",
    notes: "",
  });

  const load = useCallback(async () => {
    if (!canManage) return;
    setLoading(true);
    try {
      const res = await fetch("/api/training");
      if (!res.ok) throw new Error("Failed to load training data");
      setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, [canManage]);

  useEffect(() => {
    load();
  }, [load]);

  const addCert = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/training/certifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error("Could not save certification");
      setAddOpen(false);
      await load();
    } finally {
      setSaving(false);
    }
  };

  const deleteCert = async (id: string) => {
    if (!confirm("Remove this certification record?")) return;
    await fetch(`/api/training/certifications/${id}`, { method: "DELETE" });
    await load();
  };

  const saveWarnDays = async (days: number) => {
    await fetch("/api/training", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expirationWarnDays: days }),
    });
    await load();
  };

  if (!canManage && canComplete) {
    return <MyTrainingPanel />;
  }

  if (!canManage) {
    return (
      <EmptyState
        icon={<BookOpen className="h-12 w-12" />}
        title="Training not available"
        description="Your account is not linked to a staff profile for compliance training."
      />
    );
  }

  if (loading || !data) {
    return <p className="text-center text-slate-500 py-8">Loading training & certifications…</p>;
  }

  const certLabel = (key: string) =>
    data.certTypes.find((t) => t.key === key)?.label ?? key;

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-blue-200 bg-blue-50/80 p-4">
        <p className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <Shield className="h-4 w-4 text-blue-600" />
          Training & certification compliance
        </p>
        <p className="mt-1 text-sm text-slate-600">
          Track ServSafe, food handler cards, TIPS/alcohol permits, and mandatory harassment & safety
          training. Expiration alerts help you stay audit-ready for health department and liquor liability
          inspections.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        {[
          { label: "Expired", value: data.summary.expiredCerts, tone: "text-red-600" },
          { label: "Expiring soon", value: data.summary.expiringCerts, tone: "text-amber-600" },
          { label: "Missing certs", value: data.summary.missingCerts, tone: "text-slate-700" },
          { label: "Training gaps", value: data.summary.trainingGaps, tone: "text-orange-600" },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border bg-white p-4 text-center">
            <p className={cn("text-2xl font-bold", s.tone)}>{s.value}</p>
            <p className="text-xs text-slate-500">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        {(
          [
            ["alerts", "Alerts", AlertTriangle],
            ["certifications", "Certifications", Award],
            ["modules", "Training modules", BookOpen],
            ...(canComplete ? [["mine", "My training", ClipboardCheck] as const] : []),
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
        <div className="ml-auto flex items-center gap-2">
          <label className="text-xs text-slate-500">Warn</label>
          <Select
            value={String(data.settings.expirationWarnDays)}
            onChange={(e) => saveWarnDays(Number(e.target.value))}
            className="w-24 text-sm"
          >
            <option value="14">14 days</option>
            <option value="30">30 days</option>
            <option value="60">60 days</option>
            <option value="90">90 days</option>
          </Select>
        </div>
      </div>

      {section === "mine" && <MyTrainingPanel />}

      {section === "alerts" && (
        <div className="space-y-4">
          {data.alerts.length === 0 ? (
            <EmptyState
              icon={<CheckCircle2 className="h-12 w-12" />}
              title="All clear"
              description="No expired or missing certifications, and required training is up to date."
            />
          ) : (
            <ul className="divide-y rounded-xl border bg-white">
              {data.alerts.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center gap-3 p-4 text-sm">
                  <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", ALERT_STYLES[a.level])}>
                    {a.level.replace("_", " ")}
                  </span>
                  <span className="font-medium text-slate-900">{a.staffName}</span>
                  <span className="text-slate-500">{a.certLabel}</span>
                  {a.expiresAt && (
                    <span className="text-slate-400">
                      {a.level === "EXPIRED" ? "Expired" : "Expires"}{" "}
                      {format(new Date(a.expiresAt), "MMM d, yyyy")}
                      {a.daysUntilExpiry != null && a.daysUntilExpiry >= 0 && ` (${a.daysUntilExpiry}d)`}
                    </span>
                  )}
                  {a.auditCritical && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                      Audit critical
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
          {data.trainingGaps.length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-semibold text-slate-800">Incomplete compliance training</h3>
              <ul className="divide-y rounded-xl border bg-white">
                {data.trainingGaps.map((g, i) => (
                  <li key={i} className="flex items-center justify-between p-3 text-sm">
                    <span>
                      <strong>{g.staffName}</strong> — {g.moduleTitle}
                    </span>
                    <span className="text-xs text-slate-500">{g.reason.replace("_", " ")}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {section === "certifications" && (
        <div>
          <div className="mb-3 flex justify-end">
            <Button onClick={() => setAddOpen(true)}>
              <Plus className="h-4 w-4" />
              Add certification
            </Button>
          </div>
          <div className="overflow-x-auto rounded-xl border bg-white">
            <table className="w-full text-sm">
              <thead className="border-b bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="p-3">Staff</th>
                  <th className="p-3">Certification</th>
                  <th className="p-3">Issued</th>
                  <th className="p-3">Expires</th>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody>
                {data.certifications.map((c) => (
                  <tr key={c.id} className="border-b last:border-0">
                    <td className="p-3">
                      <p className="font-medium">{c.staffMember.name}</p>
                      <p className="text-xs text-slate-400">{c.staffMember.role}</p>
                    </td>
                    <td className="p-3">{certLabel(c.certType)}</td>
                    <td className="p-3 text-slate-600">
                      {c.issuedAt ? format(new Date(c.issuedAt), "MMM d, yyyy") : "—"}
                    </td>
                    <td className="p-3 text-slate-600">
                      {c.expiresAt ? format(new Date(c.expiresAt), "MMM d, yyyy") : "—"}
                    </td>
                    <td className="p-3 text-right">
                      <button
                        type="button"
                        onClick={() => deleteCert(c.id)}
                        className="text-slate-400 hover:text-red-600"
                        aria-label="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {section === "modules" && (
        <ul className="grid gap-3 sm:grid-cols-2">
          {data.modules.map((m) => (
            <li key={m.id} className="rounded-xl border bg-white p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-slate-900">{m.title}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {m.kind} · ~{m.estimatedMinutes} min
                    {m.required && " · Required"}
                  </p>
                </div>
                <BookOpen className="h-5 w-5 text-orange-400" />
              </div>
            </li>
          ))}
        </ul>
      )}

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Add certification">
        <div className="space-y-4">
          <FormField label="Staff member">
            <Select
              value={form.staffMemberId}
              onChange={(e) => setForm({ ...form, staffMemberId: e.target.value })}
            >
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.role})
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Certification type">
            <Select
              value={form.certType}
              onChange={(e) => setForm({ ...form, certType: e.target.value })}
            >
              {data.certTypes.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.label}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Issuer (optional)">
            <Input value={form.issuer} onChange={(e) => setForm({ ...form, issuer: e.target.value })} />
          </FormField>
          <FormField label="Certificate # (optional)">
            <Input
              value={form.certificateNumber}
              onChange={(e) => setForm({ ...form, certificateNumber: e.target.value })}
            />
          </FormField>
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label="Issued">
              <Input
                type="date"
                value={form.issuedAt}
                onChange={(e) => setForm({ ...form, issuedAt: e.target.value })}
              />
            </FormField>
            <FormField label="Expires (optional — auto if blank)">
              <Input
                type="date"
                value={form.expiresAt}
                onChange={(e) => setForm({ ...form, expiresAt: e.target.value })}
              />
            </FormField>
          </div>
          <Button className="w-full" disabled={saving} onClick={addCert}>
            Save certification
          </Button>
        </div>
      </Modal>
    </div>
  );
}
