"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Logo } from "@/components/layout/Logo";
import { Button } from "@/components/ui";
import { Input, FormField } from "@/components/ui/form";

export default function ProCleanLoginForm() {
  const [email, setEmail] = useState("pro-clean@pinnacle.app");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/pro-login")
      .then((res) => (res.ok ? res.json() : { user: null }))
      .then((data: { user?: { email: string } | null }) => {
        if (cancelled || !data.user) return;
        window.location.assign("/dashboard");
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setCheckingSession(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/pro-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Login failed");
      }
      if (data.workspaceError) {
        throw new Error(data.workspaceError);
      }
      window.location.assign(data.redirectTo || "/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  if (checkingSession) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 px-4 py-8 text-white">
        <Logo className="h-14" />
        <p className="mt-8 text-sm text-slate-400">Checking your session…</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 px-4 py-8">
      <div className="mb-8">
        <Logo className="h-14" />
      </div>

      <div className="w-full max-w-md rounded-xl border border-slate-800 bg-white p-8 shadow-xl">
        <p className="text-xs font-semibold uppercase tracking-wide text-orange-600">
          Pro clean workspace
        </p>
        <h1 className="mt-2 text-xl font-bold text-slate-900">Sign in</h1>
        <p className="mt-1 text-sm text-slate-500">
          Empty Pro restaurant — no demo seed data, no shared BBQ workspace.
        </p>

        <form className="mt-6 space-y-4" onSubmit={handleLogin}>
          <FormField label="Email">
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="username"
            />
          </FormField>
          <FormField label="Password">
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </FormField>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Signing in…" : "Sign in to clean Pro workspace"}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-500">
          Demo or owner account?{" "}
          <Link href="/login" className="text-orange-600 hover:text-orange-500">
            Standard sign-in
          </Link>
        </p>
        <p className="mt-2 text-center text-sm text-slate-400">
          Just browsing?{" "}
          <Link href="/demo" className="text-orange-600 hover:text-orange-500">
            Try the live demo
          </Link>
        </p>
      </div>
    </div>
  );
}
