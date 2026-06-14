"use client";

import { useState } from "react";
import Link from "next/link";
import { Logo } from "@/components/layout/Logo";
import { Button } from "@/components/ui";
import { Input, FormField } from "@/components/ui/form";

export default function SignupForm() {
  const [name, setName] = useState("");
  const [restaurantName, setRestaurantName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password, restaurantName }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not create account");

      window.location.assign("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create account");
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
        <h1 className="text-xl font-bold text-slate-900">Create your account</h1>
        <p className="mt-1 text-sm text-slate-500">
          Set up your restaurant workspace and sign in to your own app.
        </p>

        <form className="mt-6 space-y-4" onSubmit={handleSignup}>
          <FormField label="Your name">
            <Input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Alex Owner"
              required
            />
          </FormField>
          <FormField label="Restaurant name">
            <Input
              type="text"
              value={restaurantName}
              onChange={(e) => setRestaurantName(e.target.value)}
              placeholder="Pinnacle Bistro"
            />
          </FormField>
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
              placeholder="At least 8 characters"
              minLength={8}
              required
            />
          </FormField>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Creating account…" : "Create account"}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-500">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-orange-600 hover:text-orange-500">
            Sign in
          </Link>
        </p>
        <p className="mt-3 text-center text-sm text-slate-400">
          Just exploring?{" "}
          <Link href="/demo" className="text-orange-600 hover:text-orange-500">
            Try the live demo
          </Link>
        </p>
      </div>
    </div>
  );
}
