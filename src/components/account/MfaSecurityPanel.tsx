"use client";

import { useCallback, useEffect, useState } from "react";
import { Shield, Smartphone } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui";
import { Input, FormField } from "@/components/ui/form";
import { PageSection } from "@/components/layout/PageSections";
import { useAuth } from "@/components/auth/AuthProvider";

interface MfaStatus {
  mfaEnabled: boolean;
  backupCodesRemaining: number;
}

export function MfaSecurityPanel() {
  const searchParams = useSearchParams();
  const mfaRequired = searchParams.get("mfa") === "required";
  const { refresh, user } = useAuth();
  const [status, setStatus] = useState<MfaStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [setupSecret, setSetupSecret] = useState<string | null>(null);
  const [setupUrl, setSetupUrl] = useState<string | null>(null);
  const [setupPassword, setSetupPassword] = useState("");
  const [setupCode, setSetupCode] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);

  const [disablePassword, setDisablePassword] = useState("");
  const [disableCode, setDisableCode] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/account/mfa");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not load 2FA settings");
      setStatus(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load 2FA settings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const startSetup = async () => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/account/mfa/setup", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not start setup");
      setSetupSecret(json.secret);
      setSetupUrl(json.otpauthUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start setup");
    } finally {
      setBusy(false);
    }
  };

  const enableMfa = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/account/mfa/enable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: setupPassword, code: setupCode }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not enable 2FA");
      setBackupCodes(json.backupCodes ?? []);
      setSetupSecret(null);
      setSetupUrl(null);
      setSetupPassword("");
      setSetupCode("");
      setMessage("Two-factor authentication is now enabled.");
      await load();
      await refresh();
      if (mfaRequired) {
        window.location.assign("/dashboard");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not enable 2FA");
    } finally {
      setBusy(false);
    }
  };

  const disableMfa = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!window.confirm("Disable two-factor authentication on this account?")) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/account/mfa/disable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: disablePassword, code: disableCode }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not disable 2FA");
      setDisablePassword("");
      setDisableCode("");
      setMessage("Two-factor authentication disabled.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not disable 2FA");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <p className="text-sm text-slate-500">Loading security settings…</p>;
  }

  return (
    <PageSection
      id="account-security-mfa"
      title="Two-factor authentication"
      description="Protect your account and restaurant data with an authenticator app (Google Authenticator, 1Password, Authy, etc.)."
      defaultOpen
    >
      {mfaRequired && !status?.mfaEnabled && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <Shield className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-medium">Two-factor authentication is required</p>
            <p className="mt-0.5 text-amber-800">
              Owner accounts must enable 2FA before using the app in production.
            </p>
          </div>
        </div>
      )}
      {status?.mfaEnabled ? (
        <div className="space-y-4">
          <div className="flex items-start gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
            <Shield className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-medium">2FA is enabled</p>
              <p className="mt-0.5 text-green-700">
                {status.backupCodesRemaining} backup code
                {status.backupCodesRemaining === 1 ? "" : "s"} remaining
              </p>
            </div>
          </div>
          <form className="max-w-md space-y-4" onSubmit={disableMfa}>
            <FormField label="Password">
              <Input
                type="password"
                value={disablePassword}
                onChange={(e) => setDisablePassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </FormField>
            <FormField label="Authenticator or backup code">
              <Input
                value={disableCode}
                onChange={(e) => setDisableCode(e.target.value)}
                placeholder="6-digit code"
                required
              />
            </FormField>
            <Button type="submit" variant="secondary" disabled={busy}>
              Disable 2FA
            </Button>
            {user?.role === "OWNER" && (
              <p className="text-xs text-slate-500">
                Required for owner accounts in production.
              </p>
            )}
          </form>
        </div>
      ) : (
        <div className="space-y-4">
          {!setupSecret ? (
            <Button type="button" onClick={() => void startSetup()} disabled={busy}>
              <Smartphone className="h-4 w-4" />
              Set up authenticator app
            </Button>
          ) : (
            <form className="max-w-lg space-y-4" onSubmit={enableMfa}>
              <p className="text-sm text-slate-600">
                Scan this secret in your authenticator app, or open the setup link on your phone.
              </p>
              {setupUrl && (
                <a
                  href={setupUrl}
                  className="inline-flex text-sm font-medium text-orange-600 hover:text-orange-500"
                >
                  Open in authenticator app
                </a>
              )}
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 font-mono text-sm break-all">
                {setupSecret}
              </div>
              <FormField label="Your password">
                <Input
                  type="password"
                  value={setupPassword}
                  onChange={(e) => setSetupPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
              </FormField>
              <FormField label="6-digit code from app">
                <Input
                  value={setupCode}
                  onChange={(e) => setSetupCode(e.target.value)}
                  inputMode="numeric"
                  placeholder="123456"
                  required
                />
              </FormField>
              <Button type="submit" disabled={busy}>
                Enable two-factor authentication
              </Button>
            </form>
          )}
        </div>
      )}

      {backupCodes && (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-medium text-amber-900">Save these backup codes</p>
          <p className="mt-1 text-xs text-amber-800">
            Each code works once if you lose your phone. Store them somewhere secure — they will not
            be shown again.
          </p>
          <ul className="mt-3 grid gap-1 font-mono text-sm text-amber-950 sm:grid-cols-2">
            {backupCodes.map((code) => (
              <li key={code}>{code}</li>
            ))}
          </ul>
        </div>
      )}

      {message && <p className="mt-3 text-sm text-green-700">{message}</p>}
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </PageSection>
  );
}
