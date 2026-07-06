"use client";

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui";

export function TeamLoginCodeBanner() {
  const [teamLoginCode, setTeamLoginCode] = useState<string | null>(null);
  const [locationName, setLocationName] = useState("");
  const [canEdit, setCanEdit] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/staff/team-login-code");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not load team code");
      setTeamLoginCode(data.teamLoginCode);
      setLocationName(data.locationName);
      setCanEdit(Boolean(data.canEdit));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load team code");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const regenerate = async () => {
    if (!confirm("Generate a new team code? Employees will need the updated code to sign in.")) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/staff/team-login-code", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ regenerate: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not update code");
      setTeamLoginCode(data.teamLoginCode);
      setLocationName(data.locationName);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update code");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="mb-6 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
        Loading team sign-in code…
      </div>
    );
  }

  return (
    <div className="mb-6 rounded-lg border border-orange-200 bg-orange-50 px-4 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-medium text-slate-900">Team sign-in code</p>
          <p className="mt-1 text-sm text-slate-600">
            Share this code with {locationName || "your team"} so employees can sign in with their
            name and PIN on the login screen.
          </p>
          {teamLoginCode && (
            <p className="mt-2 font-mono text-2xl tracking-widest text-orange-700">{teamLoginCode}</p>
          )}
        </div>
        {canEdit && (
          <Button variant="secondary" size="sm" disabled={saving} onClick={regenerate}>
            <RefreshCw className="h-4 w-4" />
            {saving ? "Updating…" : "New code"}
          </Button>
        )}
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
