"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  ArrowRight,
  BarChart3,
  Brain,
  Building2,
  Camera,
  ClipboardList,
  DollarSign,
  LayoutDashboard,
  LayoutGrid,
  Package,
  Radar,
  Share2,
  Sparkles,
  Users,
  Utensils,
  Zap,
} from "lucide-react";
import { MarketingNav } from "./MarketingNav";
import { MarketingFooter } from "./MarketingFooter";
import { HeroAppEmbed } from "./HeroAppEmbed";
import {
  ANALYTICS_TABS,
  CORE_FEATURES,
  HOW_IT_WORKS,
  MARKETING_STATS,
} from "@/lib/marketing-content";
import { launchDemo } from "@/lib/demo-launch";

const ICONS = {
  "layout-dashboard": LayoutDashboard,
  brain: Brain,
  "bar-chart-3": BarChart3,
  "clipboard-list": ClipboardList,
  utensils: Utensils,
  package: Package,
  users: Users,
  "layout-grid": LayoutGrid,
  "dollar-sign": DollarSign,
  camera: Camera,
  "share-2": Share2,
  "building-2": Building2,
} as const;

export function LandingPage() {
  const router = useRouter();
  const [demoLoading, setDemoLoading] = useState(false);

  const handleTryDemo = async () => {
    setDemoLoading(true);
    try {
      await launchDemo();
      router.push("/demo");
    } catch {
      router.push("/login");
    } finally {
      setDemoLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white">
      <MarketingNav onTryDemo={handleTryDemo} demoLoading={demoLoading} />

      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 text-white">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-orange-500/20 via-transparent to-transparent" />
        <div className="relative mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-orange-500/30 bg-orange-500/10 px-3 py-1 text-xs font-medium text-orange-200">
                <Sparkles className="h-3.5 w-3.5" />
                AI-powered restaurant operations
              </div>
              <h1 className="mt-6 text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
                Run your restaurant.
                <span className="block text-orange-400">Know your numbers.</span>
              </h1>
              <p className="mt-6 max-w-xl text-lg text-slate-300">
                Pinnacle is an all-in-one manager — orders, inventory, staff, finances,
                12-tab analytics, and an AI command center that answers questions like
                &quot;What&apos;s hurting my profit this week?&quot; using live data from
                every part of your business.
              </p>
              <div className="mt-8 flex flex-wrap gap-4">
                <button
                  type="button"
                  onClick={handleTryDemo}
                  disabled={demoLoading}
                  className="inline-flex items-center gap-2 rounded-xl bg-orange-500 px-6 py-3.5 text-base font-semibold text-white shadow-lg shadow-orange-500/25 transition hover:bg-orange-400 disabled:opacity-60"
                >
                  <Zap className="h-5 w-5" />
                  {demoLoading ? "Starting demo…" : "Open full demo tour"}
                </button>
                <Link
                  href="/embed"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/5 px-6 py-3.5 text-base font-semibold text-white transition hover:bg-white/10"
                >
                  Open in new tab
                  <ArrowRight className="h-5 w-5" />
                </Link>
              </div>
            </div>

            <HeroAppEmbed />
          </div>

          <div className="mt-16 grid grid-cols-2 gap-6 border-t border-white/10 pt-10 sm:grid-cols-4">
            {MARKETING_STATS.map((s) => (
              <div key={s.label}>
                <p className="text-3xl font-bold text-orange-400">{s.value}</p>
                <p className="mt-1 text-sm text-slate-400">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <p className="text-sm font-semibold uppercase tracking-wide text-orange-600">
              Everything in one app
            </p>
            <h2 className="mt-2 text-3xl font-bold text-slate-900 sm:text-4xl">
              Built for how restaurants actually run
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-slate-600">
              From the lunch rush to month-end P&amp;L — manage daily operations and
              understand the business without juggling spreadsheets and disconnected tools.
            </p>
          </div>
          <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {CORE_FEATURES.map((feature) => {
              const Icon = ICONS[feature.icon as keyof typeof ICONS];
              return (
                <div
                  key={feature.id}
                  className="rounded-2xl border border-orange-200 bg-orange-50/50 p-6 transition hover:shadow-md"
                >
                  <div className="inline-flex rounded-xl bg-orange-100 p-3 text-orange-600">
                    <Icon className="h-6 w-6" />
                  </div>
                  <h3 className="mt-4 text-lg font-semibold text-slate-900">{feature.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600">
                    {feature.description}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Command Center */}
      <section
        id="command-center"
        className="bg-gradient-to-br from-slate-900 to-indigo-950 py-20 text-white"
      >
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <div>
              <div className="flex items-center gap-2 text-indigo-300">
                <Radar className="h-5 w-5" />
                <span className="text-sm font-semibold uppercase tracking-widest">
                  AI Command Center
                </span>
              </div>
              <h2 className="mt-4 text-3xl font-bold sm:text-4xl">
                Not a chatbot. A restaurant brain.
              </h2>
              <p className="mt-4 text-slate-300">
                Ask plain-English questions and get answers that pull from sales, labor,
                inventory, scheduling, vendor invoices, waste logs, guest reviews, and
                employee performance — in a single analysis pass.
              </p>
              <ul className="mt-6 space-y-3 text-sm text-slate-300">
                <li className="flex gap-2">
                  <span className="text-orange-400">→</span>
                  Live red/yellow/green signal board for sales, profit, labor, food cost,
                  guests, and ops
                </li>
                <li className="flex gap-2">
                  <span className="text-orange-400">→</span>
                  Cross-domain findings with dollar impacts and priority actions
                </li>
                <li className="flex gap-2">
                  <span className="text-orange-400">→</span>
                  350+ manager prompts plus 10 one-click dashboard commands
                </li>
                <li className="flex gap-2">
                  <span className="text-orange-400">→</span>
                  Works without OpenAI — GPT adds deeper synthesis when configured
                </li>
              </ul>
              <Link
                href="/demo"
                className="mt-8 inline-flex items-center gap-2 rounded-lg bg-orange-500 px-5 py-2.5 text-sm font-semibold hover:bg-orange-400"
              >
                Try the Command Center
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                Example questions
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {[
                  "What's hurting my profit this week?",
                  "What needs attention before dinner rush?",
                  "Create a suggested order for tomorrow",
                  "Who needs coaching and why?",
                  "How busy will we be this weekend?",
                ].map((q) => (
                  <span
                    key={q}
                    className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-200"
                  >
                    {q}
                  </span>
                ))}
              </div>
              <div className="mt-6 rounded-xl bg-slate-950/50 p-4">
                <p className="text-sm font-semibold text-orange-300">
                  Labor cost high for sales volume is your biggest profit drag
                </p>
                <p className="mt-2 text-xs text-slate-400">
                  Cross-checked: Sales · Labor · Inventory · Vendors · Waste · Reviews ·
                  Staff
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Analytics */}
      <section id="analytics" className="py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <p className="text-sm font-semibold uppercase tracking-wide text-orange-600">
              Deep analytics
            </p>
            <h2 className="mt-2 text-3xl font-bold text-slate-900">
              12 intelligence modules. One source of truth.
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-slate-600">
              Every tab answers real manager questions with highlights, KPI cards, and
              AI-powered Run Analysis — from menu engineering quadrants to weather-driven
              demand forecasting.
            </p>
          </div>
          <div className="mt-10 flex flex-wrap justify-center gap-2">
            {ANALYTICS_TABS.map((tab) => (
              <span
                key={tab}
                className="rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-sm font-medium text-orange-800"
              >
                {tab}
              </span>
            ))}
          </div>
          <div className="mt-12 grid gap-6 sm:grid-cols-3">
            {[
              {
                title: "Menu Engineering",
                desc: "Stars, plowhorses, puzzles, and dogs — with promote, reprice, and remove recommendations.",
              },
              {
                title: "Profitability",
                desc: "Profit by item, employee, shift, hour, channel, delivery provider, and marketing campaign.",
              },
              {
                title: "External Factors",
                desc: "Weather, events, holidays, sports, tourism, and school schedules — auto-learned impact patterns.",
              },
            ].map((item) => (
              <div key={item.title} className="rounded-2xl border border-slate-200 bg-slate-50 p-6">
                <BarChart3 className="h-8 w-8 text-orange-500" />
                <h3 className="mt-4 font-semibold text-slate-900">{item.title}</h3>
                <p className="mt-2 text-sm text-slate-600">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="border-y border-slate-200 bg-slate-50 py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-center text-3xl font-bold text-slate-900">How it works</h2>
          <div className="mt-12 grid gap-8 md:grid-cols-3">
            {HOW_IT_WORKS.map((step) => (
              <div key={step.step} className="text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-orange-500 text-lg font-bold text-white">
                  {step.step}
                </div>
                <h3 className="mt-4 text-lg font-semibold text-slate-900">{step.title}</h3>
                <p className="mt-2 text-sm text-slate-600">{step.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20">
        <div className="mx-auto max-w-4xl px-4 text-center sm:px-6">
          <h2 className="text-3xl font-bold text-slate-900 sm:text-4xl">
            See it running with real data
          </h2>
          <p className="mt-4 text-lg text-slate-600">
            Launch the live demo with a pre-loaded restaurant — menu, staff, orders,
            analytics, and AI insights ready to explore. Takes less than 10 seconds.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-4">
            <button
              type="button"
              onClick={handleTryDemo}
              disabled={demoLoading}
              className="inline-flex items-center gap-2 rounded-xl bg-orange-500 px-8 py-4 text-lg font-semibold text-white shadow-lg hover:bg-orange-400 disabled:opacity-60"
            >
              <Zap className="h-5 w-5" />
              Launch live demo
            </button>
            <Link
              href="/signup"
              className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-8 py-4 text-lg font-semibold text-slate-700 hover:bg-slate-50"
            >
              Create your account
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-8 py-4 text-lg font-semibold text-slate-700 hover:bg-slate-50"
            >
              Sign in
            </Link>
          </div>
        </div>
      </section>

      <MarketingFooter />
    </div>
  );
}
