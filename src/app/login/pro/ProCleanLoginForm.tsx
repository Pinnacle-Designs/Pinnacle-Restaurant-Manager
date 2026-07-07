"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Logo } from "@/components/layout/Logo";
import { Button } from "@/components/ui";
import { Input, FormField } from "@/components/ui/form";
import {
  isProCleanAccountEmail,
  PRO_CLEAN_POST_CHECKOUT_PATH,
} from "@/lib/pro-clean-email";
import { clearEmbedSessionCache, isEmbedMode } from "@/lib/embed-api-client";

export default function ProCleanLoginForm() {
  const [email, setEmail] = useState("pro-clean@pinnacle.app");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [existingSessionEmail, setExistingSessionEmail] = useState<string | null>(null);

  useEffect(() => {
    if (!isEmbedMode()) {
      clearEmbedSessionCache();
    }
    let cancelled = false;
    Promise.all([
      fetch("/api/auth/pro-login").then((res) => (res.ok ? res.json() : { user: null })),
      fetch("/api/auth/login").then((res) => (res.ok ? res.json() : { user: null })),
    ])
      .then(([proData, loginData]: [{ user?: { email: string } | null }, { user?: { email: string } | null }]) => {
        if (cancelled) return;
        if (proData.user && isProCleanAccountEmail(proData.user.email.toLowerCase())) {
          window.location.assign(PRO_CLEAN_POST_CHECKOUT_PATH);
          return;
        }
        if (loginData.user && !isProCleanAccountEmail(loginData.user.email.toLowerCase())) {
          setExistingSessionEmail(loginData.user.email);
        }
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
      if (
        existingSessionEmail &&
        existingSessionEmail.trim().toLowerCase() !== email.trim().toLowerCase()
      ) {
        await fetch("/api/auth/logout", { method: "POST" });
        setExistingSessionEmail(null);
      }

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
      if (!isEmbedMode()) {
        clearEmbedSessionCache();
      }
      window.location.assign(data.redirectTo || PRO_CLEAN_POST_CHECKOUT_PATH);
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
          Pro plan
        </p>
        <h1 className="mt-2 text-xl font-bold text-slate-900">Sign in to your restaurant</h1>
        <p className="mt-1 text-sm text-slate-500">
          Use the email and password from your Pro subscription. After sign-in you can install the
          app on your devices.
        </p>

        {existingSessionEmail && (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
            Signed in as <strong>{existingSessionEmail}</strong>. Submit below to switch to your Pro
            account, or{" "}
            <button
              type="button"
              className="font-medium text-orange-600 underline hover:text-orange-700"
              onClick={async () => {
                await fetch("/api/auth/logout", { method: "POST" });
                setExistingSessionEmail(null);
                window.location.reload();
              }}
            >
              sign out
            </button>{" "}
            first.
          </div>
        )}

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
            {loading ? "Signing in…" : "Sign in"}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-500">
          Different account?{" "}
          <Link href="/login" className="text-orange-600 hover:text-orange-500">
            Standard sign-in
          </Link>
        </p>
        <p className="mt-2 text-center text-sm text-slate-400">
          <Link href="/forgot-password" className="text-orange-600 hover:text-orange-500">
            Forgot password?
          </Link>
        </p>
      </div>
    </div>
  );
}
