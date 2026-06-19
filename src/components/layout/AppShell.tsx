"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { MobileNav } from "@/components/layout/MobileNav";
import { MobileHeader } from "@/components/layout/MobileHeader";
import { PrintReportStamp } from "@/components/layout/PrintReportStamp";
import { NotificationProvider } from "@/components/notifications/NotificationProvider";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { LocationLocaleProvider } from "@/components/location/LocationLocaleProvider";
import { GlobalSearchProvider } from "@/components/search/GlobalSearch";
import { PageSearchStrip } from "@/components/search/PageSearchStrip";
import { isEmbeddableEmbedParam } from "@/lib/embed-config";

function AppShellInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isMarketing = pathname === "/" || pathname === "/demo";
  const isLogin = pathname === "/login";
  const isSignup = pathname === "/signup";
  const isOnboarding = pathname === "/onboarding";
  const isTableside = pathname === "/tableside";
  const isEmbedRoute = pathname === "/embed";
  const embedParam = searchParams.get("embed");
  const isEmbed = isEmbeddableEmbedParam(embedParam);
  const isEmbedFull = embedParam === "full";
  const isEmbedMobile = embedParam === "mobile" || embedParam === "1";

  if (isLogin || isSignup || isOnboarding || isMarketing || isEmbedRoute || isTableside) {
    return <>{children}</>;
  }

  const showSidebar = !isEmbed || isEmbedFull;
  const showMobileChrome = !isEmbed || isEmbedMobile || isEmbedFull;

  const mainInner = isEmbedMobile ? (
    <main className="page-content min-h-screen min-w-0 flex-1 overflow-x-hidden overflow-y-auto">
      <div className="px-3 py-3 sm:px-4 sm:py-4">
        <PrintReportStamp />
        <Suspense fallback={null}>
          <PageSearchStrip />
        </Suspense>
        {children}
      </div>
    </main>
  ) : (
    <main className="page-content min-w-0 flex-1 overflow-x-hidden">
      <div className="mx-auto max-w-7xl px-3 py-4 sm:px-6 sm:py-6 lg:px-8">
        <PrintReportStamp />
        <Suspense fallback={null}>
          <PageSearchStrip />
        </Suspense>
        {children}
      </div>
    </main>
  );

  return (
    <AuthProvider>
      <LocationLocaleProvider>
        <GlobalSearchProvider>
          <NotificationProvider>
            <div className="flex min-h-screen min-w-0 overflow-x-hidden">
              {showSidebar && <Sidebar />}
              <div className={`flex min-w-0 flex-1 flex-col ${showMobileChrome ? "pb-[calc(5rem+env(safe-area-inset-bottom,0px))] md:pb-0" : ""}`}>
                {showMobileChrome && <MobileHeader />}
                {mainInner}
              </div>
            </div>
            {showMobileChrome && <MobileNav />}
          </NotificationProvider>
        </GlobalSearchProvider>
      </LocationLocaleProvider>
    </AuthProvider>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-slate-50">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-orange-500 border-t-transparent" />
        </div>
      }
    >
      <AppShellInner>{children}</AppShellInner>
    </Suspense>
  );
}
