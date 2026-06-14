import Link from "next/link";
import { Logo } from "@/components/layout/Logo";

export function MarketingFooter() {
  return (
    <footer className="border-t border-slate-200 bg-slate-50">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-8 md:flex-row md:items-start md:justify-between">
          <div>
            <Logo href="/" className="h-8" />
            <p className="mt-3 max-w-sm text-sm text-slate-500">
              AI-powered restaurant management — operations, analytics, and a command
              center that answers the questions owners actually ask.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-8 sm:grid-cols-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Product
              </p>
              <ul className="mt-3 space-y-2 text-sm text-slate-600">
                <li>
                  <Link href="#features" className="hover:text-orange-600">
                    Features
                  </Link>
                </li>
                <li>
                  <Link href="/demo" className="hover:text-orange-600">
                    Live demo
                  </Link>
                </li>
                <li>
                  <Link href="/docs/pricing.html" className="hover:text-orange-600">
                    Pricing
                  </Link>
                </li>
                <li>
                  <Link href="/#analytics" className="hover:text-orange-600">
                    Analytics
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Account
              </p>
              <ul className="mt-3 space-y-2 text-sm text-slate-600">
                <li>
                  <Link href="/login" className="hover:text-orange-600">
                    Sign in
                  </Link>
                </li>
                <li>
                  <Link href="/signup" className="hover:text-orange-600">
                    Create account
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Live demo
              </p>
              <ul className="mt-3 space-y-2 text-sm text-slate-600">
                <li>
                  <Link href="/demo" className="hover:text-orange-600">
                    Try interactive demo
                  </Link>
                </li>
                <li>
                  <span className="text-slate-400">owner@pinnacle.com / demo1234</span>
                </li>
              </ul>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Stack
              </p>
              <ul className="mt-3 space-y-2 text-sm text-slate-600">
                <li>Next.js 15</li>
                <li>Prisma + SQLite</li>
                <li>OpenAI (optional)</li>
              </ul>
            </div>
          </div>
        </div>
        <p className="mt-10 border-t border-slate-200 pt-6 text-center text-xs text-slate-400">
          © {new Date().getFullYear()} Pinnacle Restaurant Manager. Built for independent
          restaurants and growing groups.
        </p>
      </div>
    </footer>
  );
}
