"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui";
import { Input, FormField } from "@/components/ui/form";

interface TeamMember {
  id: string;
  name: string;
  role: string;
  needsPinSetup: boolean;
}

type Step = "code" | "pick" | "pin" | "setup";

export function TeamPinLogin({
  loading,
  setLoading,
  onError,
  onSuccess,
}: {
  loading: boolean;
  setLoading: (value: boolean) => void;
  onError: (message: string | null) => void;
  onSuccess: (data: { redirectTo?: string }) => void;
}) {
  const [step, setStep] = useState<Step>("code");
  const [teamCode, setTeamCode] = useState("");
  const [locationName, setLocationName] = useState("");
  const [staff, setStaff] = useState<TeamMember[]>([]);
  const [selected, setSelected] = useState<TeamMember | null>(null);
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");

  useEffect(() => {
    const saved = localStorage.getItem("pinnacle_team_code");
    if (saved && /^\d{4,6}$/.test(saved)) {
      setTeamCode(saved);
    }
  }, []);

  const loadRoster = async () => {
    const code = teamCode.trim();
    if (!/^\d{4,6}$/.test(code)) {
      onError("Enter your 4–6 digit restaurant team code");
      return;
    }
    setLoading(true);
    onError(null);
    try {
      const res = await fetch(`/api/auth/team-roster?code=${encodeURIComponent(code)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not load team");
      localStorage.setItem("pinnacle_team_code", code);
      setLocationName(data.locationName);
      setStaff(data.staff ?? []);
      if (!data.staff?.length) {
        onError("No team logins are set up yet — ask your manager to enable app access.");
        return;
      }
      setStep("pick");
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not load team");
    } finally {
      setLoading(false);
    }
  };

  const pickMember = (member: TeamMember) => {
    setSelected(member);
    setPin("");
    setConfirmPin("");
    onError(null);
    setStep(member.needsPinSetup ? "setup" : "pin");
  };

  const submitPin = async (setup: boolean) => {
    if (!selected) return;
    if (setup && pin !== confirmPin) {
      onError("PINs do not match");
      return;
    }
    setLoading(true);
    onError(null);
    try {
      const res = await fetch("/api/auth/pin-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: teamCode.trim(),
          staffMemberId: selected.id,
          pin,
          setup,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.needsPinSetup) {
          setStep("setup");
          throw new Error("Choose your PIN to finish setup");
        }
        throw new Error(data.error || "Sign in failed");
      }
      if (data.workspaceError) {
        throw new Error(data.workspaceError);
      }
      onSuccess(data);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Sign in failed");
    } finally {
      setLoading(false);
    }
  };

  if (step === "code") {
    return (
      <div className="space-y-4">
        <p className="text-sm text-slate-500">
          Enter the team code from your manager, then choose your name and PIN.
        </p>
        <FormField label="Restaurant team code">
          <Input
            value={teamCode}
            onChange={(e) => setTeamCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            inputMode="numeric"
            pattern="[0-9]*"
            placeholder="6-digit code"
            required
          />
        </FormField>
        <Button type="button" className="w-full" disabled={loading} onClick={loadRoster}>
          {loading ? "Loading…" : "Continue"}
        </Button>
      </div>
    );
  }

  if (step === "pick") {
    return (
      <div className="space-y-4">
        <p className="text-sm text-slate-500">
          {locationName} — select your name
        </p>
        <div className="max-h-64 space-y-2 overflow-y-auto">
          {staff.map((member) => (
            <button
              key={member.id}
              type="button"
              className="flex w-full items-center justify-between rounded-lg border border-slate-200 px-4 py-3 text-left hover:border-orange-300 hover:bg-orange-50"
              onClick={() => pickMember(member)}
            >
              <span className="font-medium text-slate-900">{member.name}</span>
              <span className="text-sm text-slate-500">{member.role}</span>
            </button>
          ))}
        </div>
        <button
          type="button"
          className="w-full text-sm text-slate-500 hover:text-slate-700"
          onClick={() => {
            setStep("code");
            onError(null);
          }}
        >
          Use a different team code
        </button>
      </div>
    );
  }

  if (step === "setup") {
    return (
      <div className="space-y-4">
        <p className="text-sm text-slate-500">
          Welcome, {selected?.name}. Choose a 4–6 digit PIN you&apos;ll use to sign in.
        </p>
        <FormField label="Choose PIN">
          <Input
            type="password"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
            required
          />
        </FormField>
        <FormField label="Confirm PIN">
          <Input
            type="password"
            value={confirmPin}
            onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
            required
          />
        </FormField>
        <Button
          type="button"
          className="w-full"
          disabled={loading || pin.length < 4}
          onClick={() => submitPin(true)}
        >
          {loading ? "Saving…" : "Save PIN & sign in"}
        </Button>
        <button
          type="button"
          className="w-full text-sm text-slate-500 hover:text-slate-700"
          onClick={() => setStep("pick")}
        >
          Back
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">
        Enter your PIN, {selected?.name}.
      </p>
      <FormField label="PIN">
        <Input
          type="password"
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={6}
          autoFocus
          required
        />
      </FormField>
      <Button
        type="button"
        className="w-full"
        disabled={loading || pin.length < 4}
        onClick={() => submitPin(false)}
      >
        {loading ? "Signing in…" : "Sign in"}
      </Button>
      <button
        type="button"
        className="w-full text-sm text-slate-500 hover:text-slate-700"
        onClick={() => {
          setStep("pick");
          setPin("");
          onError(null);
        }}
      >
        Back
      </button>
    </div>
  );
}
