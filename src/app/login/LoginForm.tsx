"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Database, Sparkles } from "lucide-react";
import { Logo } from "@/components/layout/Logo";
import { Button } from "@/components/ui";
import { Input, FormField } from "@/components/ui/form";
import { ROLE_LABELS } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import type { AppRole } from "@prisma/client";

const DEMO_MODE_KEY = "pinnacle_demo_mode";

type DemoMode = "seeded" | "fresh";

const DEMO_ACCOUNTS: Array<{ email: string; role: AppRole }> = [
  { email: "owner@pinnacle.com", role: "OWNER" },
  { email: "manager@pinnacle.com", role: "MANAGER" },
  { email: "server@pinnacle.com", role: "SERVER" },
  { email: "kitchen@pinnacle.com", role: "KITCHEN" },
  { email: "host@pinnacle.com", role: "HOST" },
];

async function ensureDemoUsers() {
  const res = await fetch("/api/auth/seed", { method: "POST" });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Could not create demo users");
  }
}

export default function LoginForm() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("demo1234");
  const [demoMode, setDemoMode] = useState<DemoMode>("seeded");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [seeding, setSeeding] = useState(true);

  useEffect(() => {
    const saved = localStorage.getItem(DEMO_MODE_KEY);
    if (saved === "fresh" || saved === "seeded") setDemoMode(saved);

    ensureDemoUsers()
      .catch((err) => {
        console.error(err);
        setError("Demo accounts could not be initialized. Try again in a moment.");
      })
      .finally(() => setSeeding(false));
  }, []);

  const selectDemoMode = (mode: DemoMode) => {
    setDemoMode(mode);
    localStorage.setItem(DEMO_MODE_KEY, mode);
  };

  const completeLogin = async (loginEmail?: string, loginPassword?: string) => {
    await ensureDemoUsers();

    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: loginEmail ?? email,
        password: loginPassword ?? password,
        demoMode,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Login failed");
    if (data.workspaceError) {
      throw new Error(data.workspaceError);
    }

    const from = searchParams.get("from") || "/dashboard";
    const embed = searchParams.get("embed");
    let target = from;
    if (embed && (embed === "mobile" || embed === "full" || embed === "1") && !from.includes("embed=")) {
      const embedValue = embed === "1" ? "mobile" : embed;
      target = from + (from.includes("?") ? "&" : "?") + "embed=" + embedValue;
    }
    window.location.assign(target);
  };

  const handleLogin = async (loginEmail?: string, loginPassword?: string) => {
    setLoading(true);
    setError(null);
    try {
      await completeLogin(loginEmail, loginPassword);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  const resetDemoUsers = async () => {
    setLoading(true);
    setError(null);
    try {
      await ensureDemoUsers();
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reset demo users");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-900 px-4 py-8">
      <div className="mb-8">
        <Logo className="h-14" />
      </div>

      <div className="w-full max-w-md rounded-xl bg-white p-8 shadow-xl">
        <h1 className="text-xl font-bold text-slate-900">Sign in</h1>
        <p className="mt-1 text-sm text-slate-500">Enter your credentials to continue</p>

        <div className="mt-6">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">
            Demo workspace
          </p>
          <div className="grid grid-cols-2 gap-2 rounded-lg border bg-slate-50 p-1">
            <button
              type="button"
              onClick={() => selectDemoMode("seeded")}
              className={cn(
                "flex flex-col items-center gap-1 rounded-md px-3 py-3 text-center text-xs transition-colors",
                demoMode === "seeded"
                  ? "bg-orange-500 text-white shadow-sm"
                  : "text-slate-600 hover:bg-white"
              )}
            >
              <Sparkles className="h-4 w-4" />
              <span className="font-semibold">Sample data</span>
              <span className={cn("text-[10px]", demoMode === "seeded" ? "text-orange-100" : "text-slate-400")}>
                Menu, staff, orders pre-loaded
              </span>
            </button>
            <button
              type="button"
              onClick={() => selectDemoMode("fresh")}
              className={cn(
                "flex flex-col items-center gap-1 rounded-md px-3 py-3 text-center text-xs transition-colors",
                demoMode === "fresh"
                  ? "bg-orange-500 text-white shadow-sm"
                  : "text-slate-600 hover:bg-white"
              )}
            >
              <Database className="h-4 w-4" />
              <span className="font-semibold">Blank slate</span>
              <span className={cn("text-[10px]", demoMode === "fresh" ? "text-orange-100" : "text-slate-400")}>
                Empty location, add your own data
              </span>
            </button>
          </div>
        </div>

        <form
          className="mt-6 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            handleLogin();
          }}
        >
          <FormField label="Email">
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@pinnacle.com"
              required
            />
          </FormField>
          <FormField label="Password">
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </FormField>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading || seeding}>
            {seeding ? "Preparing demo accounts..." : loading ? "Signing in..." : "Sign in"}
          </Button>
        </form>

        <div className="mt-8 border-t pt-6">
          <p className="mb-3 text-xs font-medium uppercase tracking-wide text-slate-400">
            Quick demo (password: demo1234)
          </p>
          <div className="space-y-2">
            {DEMO_ACCOUNTS.map((account) => (
              <button
                key={account.email}
                type="button"
                disabled={loading || seeding}
                onClick={() => {
                  setEmail(account.email);
                  handleLogin(account.email, "demo1234");
                }}
                className="flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm hover:bg-slate-50"
              >
                <span className="text-slate-700">{ROLE_LABELS[account.role]}</span>
                <span className="text-xs text-slate-400">{account.email}</span>
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={resetDemoUsers}
            disabled={loading || seeding}
            className="mt-4 w-full text-center text-xs text-slate-400 hover:text-orange-600 disabled:opacity-50"
          >
            Reset demo passwords
          </button>
        </div>
      </div>
    </div>
  );
}
