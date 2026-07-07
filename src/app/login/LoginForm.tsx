"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Logo } from "@/components/layout/Logo";
import { Button } from "@/components/ui";
import { Input, FormField } from "@/components/ui/form";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { SignupPlanModal } from "@/components/auth/SignupPlanModal";
import { PlanDemoLogins } from "@/components/auth/PlanDemoLogins";
import { ProCleanDevLogin } from "@/components/auth/ProCleanDevLogin";
import { TeamPinLogin } from "@/components/auth/TeamPinLogin";
import { isProCleanAccountEmail, PRO_CLEAN_DEFAULT_EMAIL } from "@/lib/pro-clean-email";

export default function LoginForm() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [signupOpen, setSignupOpen] = useState(false);
  const [mfaPendingToken, setMfaPendingToken] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  const [checkingSession, setCheckingSession] = useState(true);
  const [signInMode, setSignInMode] = useState<"owner" | "team">("owner");
  const [existingSessionEmail, setExistingSessionEmail] = useState<string | null>(null);

  const wantsAccountSwitch =
    searchParams.get("switch") === "1" || searchParams.get("account") === "pro-clean";

  useEffect(() => {
    const account = searchParams.get("account");
    if (account === "pro-clean") {
      setEmail(PRO_CLEAN_DEFAULT_EMAIL);
    }
  }, [searchParams]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/login")
      .then((res) => (res.ok ? res.json() : { user: null }))
      .then((data: { user?: { email: string } | null }) => {
        if (cancelled || !data.user) return;
        const sessionEmail = data.user.email.toLowerCase();
        const typedEmail = email.trim().toLowerCase();
        const switchingToProClean =
          wantsAccountSwitch ||
          (typedEmail && isProCleanAccountEmail(typedEmail) && !isProCleanAccountEmail(sessionEmail));

        if (switchingToProClean && sessionEmail !== typedEmail && typedEmail) {
          setExistingSessionEmail(data.user.email);
          return;
        }
        if (wantsAccountSwitch && !isProCleanAccountEmail(sessionEmail)) {
          setExistingSessionEmail(data.user.email);
          return;
        }
        if (isProCleanAccountEmail(sessionEmail)) {
          redirectAfterLogin({ redirectTo: "/download?from=checkout" });
          return;
        }
        redirectAfterLogin({});
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setCheckingSession(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only run on mount
  }, []);

  const redirectAfterLogin = (data: { redirectTo?: string }) => {
    const from = searchParams.get("from") || "/dashboard";
    const embed = searchParams.get("embed");
    let target = data.redirectTo || from;
    if (embed && (embed === "mobile" || embed === "full" || embed === "1") && !from.includes("embed=")) {
      const embedValue = embed === "1" ? "mobile" : embed;
      target = from + (from.includes("?") ? "&" : "?") + "embed=" + embedValue;
    }
    window.location.assign(target);
  };

  const completeLogin = async (loginEmail = email, loginPassword = password) => {
    const normalizedEmail = loginEmail.trim().toLowerCase();
    const loginEndpoint = isProCleanAccountEmail(normalizedEmail)
      ? "/api/auth/pro-login"
      : "/api/auth/login";

    let sessionEmail: string | null = existingSessionEmail;
    if (!sessionEmail) {
      try {
        const sessionRes = await fetch("/api/auth/login");
        if (sessionRes.ok) {
          const sessionData = (await sessionRes.json()) as { user?: { email: string } | null };
          sessionEmail = sessionData.user?.email ?? null;
        }
      } catch {
        sessionEmail = null;
      }
    }

    if (sessionEmail && sessionEmail.trim().toLowerCase() !== normalizedEmail) {
      await fetch("/api/auth/logout", { method: "POST" });
      setExistingSessionEmail(null);
    }

    const res = await fetch(loginEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: loginEmail, password: loginPassword }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Login failed");

    if (data.mfaRequired && data.pendingToken) {
      setEmail(loginEmail);
      setMfaPendingToken(data.pendingToken);
      setMfaCode("");
      return;
    }

    if (data.workspaceError) {
      throw new Error(data.workspaceError);
    }

    redirectAfterLogin(data);
  };

  const verifyMfa = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mfaPendingToken) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/mfa/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pendingToken: mfaPendingToken, code: mfaCode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Verification failed");
      if (data.workspaceError) throw new Error(data.workspaceError);
      redirectAfterLogin(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed");
    } finally {
      setLoading(false);
    }
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

  if (checkingSession) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-900 px-4 py-8 text-white">
        <Logo className="h-14" />
        <p className="mt-8 text-sm text-slate-400">Checking your session…</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-900 px-4 py-8">
      <div className="mb-8">
        <Logo className="h-14" />
      </div>

      <div className="w-full max-w-md rounded-xl bg-white p-8 shadow-xl">
        {!mfaPendingToken ? (
          <>
            <div className="flex rounded-lg border border-slate-200 p-1">
              <button
                type="button"
                className={`flex-1 rounded-md px-3 py-2 text-sm font-medium ${
                  signInMode === "owner"
                    ? "bg-slate-900 text-white"
                    : "text-slate-600 hover:text-slate-900"
                }`}
                onClick={() => {
                  setSignInMode("owner");
                  setError(null);
                }}
              >
                Owner / manager
              </button>
              <button
                type="button"
                className={`flex-1 rounded-md px-3 py-2 text-sm font-medium ${
                  signInMode === "team"
                    ? "bg-slate-900 text-white"
                    : "text-slate-600 hover:text-slate-900"
                }`}
                onClick={() => {
                  setSignInMode("team");
                  setError(null);
                }}
              >
                Team member
              </button>
            </div>

            {signInMode === "owner" ? (
              <>
                <h1 className="mt-4 text-xl font-bold text-slate-900">Sign in</h1>
                <p className="mt-1 text-sm text-slate-500">
                  Sign in to your restaurant workspace. You&apos;ll stay signed in on this device.
                </p>

                {existingSessionEmail && (
                  <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                    Signed in as <strong>{existingSessionEmail}</strong>. Submit the form below to
                    switch accounts, or{" "}
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
                      placeholder="you@restaurant.com"
                      required
                    />
                  </FormField>
                  <FormField label="Password">
                    <PasswordInput
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      autoComplete="current-password"
                    />
                  </FormField>
                  <p className="text-right text-sm">
                    <Link href="/forgot-password" className="text-orange-600 hover:text-orange-500">
                      Forgot password?
                    </Link>
                  </p>
                  {error && <p className="text-sm text-red-600">{error}</p>}
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? "Signing in…" : "Sign in"}
                  </Button>
                </form>

                <div className="mt-6">
                  <Button
                    type="button"
                    variant="secondary"
                    className="w-full"
                    onClick={() => setSignupOpen(true)}
                  >
                    Create account
                  </Button>
                </div>

                <SignupPlanModal open={signupOpen} onClose={() => setSignupOpen(false)} />

                <PlanDemoLogins
                  loading={loading}
                  onLogin={async (loginEmail, loginPassword) => {
                    setLoading(true);
                    setError(null);
                    try {
                      await completeLogin(loginEmail, loginPassword);
                    } catch (err) {
                      setError(err instanceof Error ? err.message : "Login failed");
                    } finally {
                      setLoading(false);
                    }
                  }}
                />

                <ProCleanDevLogin
                  loading={loading}
                  onLogin={async (loginEmail, loginPassword) => {
                    setLoading(true);
                    setError(null);
                    try {
                      await completeLogin(loginEmail, loginPassword);
                    } catch (err) {
                      setError(err instanceof Error ? err.message : "Login failed");
                    } finally {
                      setLoading(false);
                    }
                  }}
                />
              </>
            ) : (
              <div className="mt-4">
                <h1 className="text-xl font-bold text-slate-900">Team sign in</h1>
                <p className="mt-1 text-sm text-slate-500">
                  Use the restaurant code from your manager, then your name and PIN.
                </p>
                {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
                <div className="mt-6">
                  <TeamPinLogin
                    loading={loading}
                    setLoading={setLoading}
                    onError={setError}
                    onSuccess={redirectAfterLogin}
                  />
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            <h1 className="text-xl font-bold text-slate-900">Two-factor verification</h1>
            <p className="mt-1 text-sm text-slate-500">
              Enter the 6-digit code from your authenticator app for {email}.
            </p>
            <form className="mt-6 space-y-4" onSubmit={verifyMfa}>
              <FormField label="Authenticator code">
                <Input
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value)}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="123456"
                  required
                />
              </FormField>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Verifying…" : "Verify & sign in"}
              </Button>
              <button
                type="button"
                className="w-full text-sm text-slate-500 hover:text-slate-700"
                onClick={() => {
                  setMfaPendingToken(null);
                  setMfaCode("");
                  setError(null);
                }}
              >
                Back to sign in
              </button>
            </form>
          </>
        )}

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
