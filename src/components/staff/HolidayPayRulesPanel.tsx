"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui";
import { Input, Select, FormField } from "@/components/ui/form";
import { PageSection } from "@/components/layout/PageSections";

export interface HolidayPayRuleState {
  enabled: boolean;
  templateId: string | null;
  ruleName: string;
  tenureDaysRequired: number;
  requireFirstLastShift: boolean;
  lookbackDays: number;
  denominatorMode: string;
  fixedDivisor: number;
  annualPercentage: number | null;
  holidayPremiumMultiplier: number;
  substituteDayEnabled: boolean;
  substituteDayMultiplier: number;
  payStatutoryWhenOff: boolean;
}

interface TemplateOption {
  id: string;
  name: string;
  region: string;
  description: string;
}

interface HolidayPayRulesPanelProps {
  embeddedProvider?: string;
  embeddedConnected?: boolean;
}

export function HolidayPayRulesPanel({
  embeddedProvider = "NONE",
  embeddedConnected = false,
}: HolidayPayRulesPanelProps) {
  const [rule, setRule] = useState<HolidayPayRuleState | null>(null);
  const [templates, setTemplates] = useState<TemplateOption[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [ruleRes, templateRes] = await Promise.all([
      fetch("/api/payroll/holiday-rules"),
      fetch("/api/payroll/holiday-rules/templates"),
    ]);
    if (!ruleRes.ok) throw new Error("Failed to load holiday rules");
    setRule(await ruleRes.json());
    if (templateRes.ok) {
      const data = await templateRes.json();
      setTemplates(data.templates ?? []);
    }
  }, []);

  useEffect(() => {
    load().catch(() => setError("Could not load holiday pay rules"));
  }, [load]);

  const applyTemplate = async (templateId: string) => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/payroll/holiday-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId }),
      });
      if (!res.ok) throw new Error("Template not found");
      const data = await res.json();
      setRule({ ...data.rule, enabled: rule?.enabled ?? false });
      setMessage(`Applied template: ${data.template.name}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Template apply failed");
    } finally {
      setSaving(false);
    }
  };

  const save = async () => {
    if (!rule) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/payroll/holiday-rules", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(rule),
      });
      if (!res.ok) throw new Error("Failed to save");
      setRule(await res.json());
      setMessage("Holiday pay rules saved");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  if (!rule) {
    return <p className="text-sm text-slate-500">Loading holiday pay rules…</p>;
  }

  const delegated =
    embeddedProvider !== "NONE" && embeddedConnected;

  return (
    <div className="space-y-4">
      {delegated && (
        <p className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          Statutory holiday calculations are delegated to{" "}
          <strong>{embeddedProvider.replace("_", " ")}</strong>. Configure premium
          multipliers here only if your provider does not cover them.
        </p>
      )}

      {!delegated && (
        <p className="text-sm text-slate-600">
          Rules engine path — configure eligibility, lookback, and premium multipliers
          per your jurisdiction. Update templates when laws change; no code deploy needed.
          For actual pay disbursement and tax withholding, connect Gusto, Wagepoint, or
          Papaya Global under embedded payroll below.
        </p>
      )}

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}
      {message && (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {message}
        </p>
      )}

      <PageSection id="holiday-templates" title="Jurisdiction templates" defaultOpen>
        <div className="grid gap-2 sm:grid-cols-2">
          {templates.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => applyTemplate(t.id)}
              disabled={saving}
              className="rounded-lg border p-3 text-left text-sm hover:border-orange-300 hover:bg-orange-50/50"
            >
              <p className="font-medium text-slate-900">{t.name}</p>
              <p className="text-xs text-slate-500">{t.region}</p>
              <p className="mt-1 text-xs text-slate-600">{t.description}</p>
            </button>
          ))}
        </div>
      </PageSection>

      <PageSection id="holiday-eligibility" title="Eligibility triggers" defaultOpen>
        <label className="mb-3 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={rule.enabled}
            onChange={(e) => setRule({ ...rule, enabled: e.target.checked })}
          />
          Enable holiday pay rules engine
        </label>
        <FormField label="Rule name">
          <Input
            value={rule.ruleName}
            onChange={(e) => setRule({ ...rule, ruleName: e.target.value })}
          />
        </FormField>
        <NumberField
          label="Minimum tenure (days)"
          value={rule.tenureDaysRequired}
          onChange={(v) => setRule({ ...rule, tenureDaysRequired: v })}
        />
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={rule.requireFirstLastShift}
            onChange={(e) =>
              setRule({ ...rule, requireFirstLastShift: e.target.checked })
            }
          />
          Require first &amp; last scheduled shift before/after holiday
        </label>
      </PageSection>

      <PageSection id="holiday-lookback" title="Lookback period">
        <NumberField
          label="Lookback days"
          value={rule.lookbackDays}
          onChange={(v) => setRule({ ...rule, lookbackDays: v })}
        />
        <FormField label="Calculation denominator">
          <Select
            value={rule.denominatorMode}
            onChange={(e) => setRule({ ...rule, denominatorMode: e.target.value })}
          >
            <option value="FIXED_DIVISOR">Fixed divisor (e.g. ÷ 20)</option>
            <option value="DAYS_WORKED">Days worked in lookback</option>
            <option value="ANNUAL_PERCENTAGE">Annual earnings percentage</option>
          </Select>
        </FormField>
        {rule.denominatorMode === "FIXED_DIVISOR" && (
          <NumberField
            label="Fixed divisor"
            value={rule.fixedDivisor}
            onChange={(v) => setRule({ ...rule, fixedDivisor: v })}
          />
        )}
        {rule.denominatorMode === "ANNUAL_PERCENTAGE" && (
          <NumberField
            label="Annual percentage (%)"
            value={rule.annualPercentage ?? 4}
            onChange={(v) => setRule({ ...rule, annualPercentage: v })}
          />
        )}
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={rule.payStatutoryWhenOff}
            onChange={(e) =>
              setRule({ ...rule, payStatutoryWhenOff: e.target.checked })
            }
          />
          Pay statutory average when employee is off on the holiday
        </label>
      </PageSection>

      <PageSection id="holiday-prem" title="Premium multipliers">
        <FormField label="Holiday hours worked multiplier">
          <Select
            value={String(rule.holidayPremiumMultiplier)}
            onChange={(e) =>
              setRule({
                ...rule,
                holidayPremiumMultiplier: parseFloat(e.target.value) || 1.5,
              })
            }
          >
            <option value="1">1.0× (standard rate)</option>
            <option value="1.5">1.5× (time and a half)</option>
            <option value="2">2.0× (double time)</option>
          </Select>
        </FormField>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={rule.substituteDayEnabled}
            onChange={(e) =>
              setRule({ ...rule, substituteDayEnabled: e.target.checked })
            }
          />
          Substitute day off — accrue day off instead of cash premium
        </label>
        {rule.substituteDayEnabled && (
          <NumberField
            label="Substitute day rate multiplier"
            value={rule.substituteDayMultiplier}
            onChange={(v) => setRule({ ...rule, substituteDayMultiplier: v })}
          />
        )}
      </PageSection>

      <Button onClick={save} disabled={saving}>
        {saving ? "Saving…" : "Save holiday rules"}
      </Button>
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
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
