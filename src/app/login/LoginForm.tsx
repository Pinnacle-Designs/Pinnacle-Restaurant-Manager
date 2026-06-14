"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Logo } from "@/components/layout/Logo";
import { Button } from "@/components/ui";
import { Input, FormField } from "@/components/ui/form";

export default function LoginForm() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const completeLogin = async () => {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
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

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await completeLogin();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
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
        <p className="mt-1 text-sm text-slate-500">
          Sign in to your restaurant workspace.
        </p>

        <form className="mt-6 space-y-4" onSubmit={handleLogin}>
          <FormField label="Email">
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@restaurant.com"
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
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Signing in…" : "Sign in"}
          </Button>
        </form>

        <div className="mt-6">
          <Link
            href="/signup"
            className="inline-flex w-full items-center justify-center rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100"
          >
            Create account
          </Link>
        </div>

        <p className="mt-4 text-center text-sm text-slate-400">
          Just exploring?{" "}
          <Link href="/demo" className="text-orange-600 hover:text-orange-500">
            Try the live demo
          </Link>
        </p>
      </div>
    </div>
  );
}
