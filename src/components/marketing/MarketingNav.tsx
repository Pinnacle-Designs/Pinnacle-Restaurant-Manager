"use client";

import Link from "next/link";
import { Menu, X } from "lucide-react";
import { useState } from "react";
import { Logo } from "@/components/layout/Logo";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "#features", label: "Features" },
  { href: "#analytics", label: "Analytics" },
  { href: "#command-center", label: "AI" },
  { href: "/demo", label: "Live Demo" },
  { href: "/docs/pricing.html", label: "Pricing" },
];

interface MarketingNavProps {
  onTryDemo?: () => void;
  demoLoading?: boolean;
}

export function MarketingNav({ onTryDemo, demoLoading }: MarketingNavProps) {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-slate-950/80 backdrop-blur-lg">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
        <Logo href="/" variant="on-dark" priority />

        <nav className="hidden items-center gap-8 md:flex">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-sm font-medium text-slate-300 transition hover:text-white"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-3 md:flex">
          <Link
            href="/login"
            className="text-sm font-medium text-slate-300 transition hover:text-white"
          >
            Sign in
          </Link>
          {onTryDemo ? (
            <button
              type="button"
              onClick={onTryDemo}
              disabled={demoLoading}
              className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-orange-400 disabled:opacity-60"
            >
              {demoLoading ? "Loading…" : "Try live demo"}
            </button>
          ) : (
            <Link
              href="/demo"
              className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-orange-400"
            >
              Try live demo
            </Link>
          )}
        </div>

        <button
          type="button"
          className="text-white md:hidden"
          onClick={() => setOpen(!open)}
          aria-label="Toggle menu"
        >
          {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      <div
        className={cn(
          "border-t border-white/10 bg-slate-950 px-4 py-4 md:hidden",
          open ? "block" : "hidden"
        )}
      >
        <nav className="flex flex-col gap-3">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              className="text-sm font-medium text-slate-300"
            >
              {link.label}
            </Link>
          ))}
          <Link href="/login" className="text-sm font-medium text-slate-300">
            Sign in
          </Link>
          <Link
            href="/demo"
            className="rounded-lg bg-orange-500 px-4 py-2 text-center text-sm font-semibold text-white"
          >
            Try live demo
          </Link>
        </nav>
      </div>
    </header>
  );
}
