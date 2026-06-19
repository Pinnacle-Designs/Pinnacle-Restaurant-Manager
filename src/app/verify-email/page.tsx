"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Logo } from "@/components/layout/Logo";

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setError("Missing verification token.");
      return;
    }
    void (async () => {
      try {
        const res = await fetch(`/api/auth/verify-email?token=${encodeURIComponent(token)}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Verification failed");
        setMessage(data.message);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Verification failed");
      }
    })();
  }, [token]);

  return (
    <div className="mt-6 text-sm">
      {message && <p className="text-green-700">{message}</p>}
      {error && <p className="text-red-600">{error}</p>}
      {message && (
        <p className="mt-4">
          <Link href="/dashboard" className="text-orange-600 hover:text-orange-500">
            Continue to dashboard
          </Link>
        </p>
      )}
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-900 px-4 py-8">
      <div className="mb-8">
        <Logo className="h-14" />
      </div>
      <div className="w-full max-w-md rounded-xl bg-white p-8 shadow-xl">
        <h1 className="text-xl font-bold text-slate-900">Verify email</h1>
        <Suspense fallback={<p className="mt-6 text-sm text-slate-500">Verifying…</p>}>
          <VerifyEmailContent />
        </Suspense>
      </div>
    </div>
  );
}
