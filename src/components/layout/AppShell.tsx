"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { MobileNav } from "@/components/layout/MobileNav";
import { MobileHeader } from "@/components/layout/MobileHeader";
import { DesktopTopBar } from "@/components/layout/DesktopTopBar";
import { PrintReportStamp } from "@/components/layout/PrintReportStamp";
import { NotificationProvider } from "@/components/notifications/NotificationProvider";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { LocationLocaleProvider } from "@/components/location/LocationLocaleProvider";
import { GlobalSearchProvider } from "@/components/search/GlobalSearch";
import { PageSearchStrip } from "@/components/search/PageSearchStrip";
import { isEmbeddableEmbedParam } from "@/lib/embed-config";
import { bootstrapEmbedSession } from "@/lib/embed-api-client";
import { EmbedSessionBootstrap } from "@/components/layout/EmbedSessionBootstrap";

function AppShellInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isMarketing = pathname === "/" || pathname === "/demo";
  const isLogin = pathname === "/login";
  const isSignup = pathname === "/signup";
  const isOnboarding = pathname === "/onboarding";
  const isDownload = pathname === "/download";
  const isLegal = pathname === "/privacy" || pathname === "/terms";
  const isTableside = pathname === "/tableside";
  const isEmbedRoute = pathname === "/embed";
  const embedParam = searchParams.get("embed");
  const isEmbed = isEmbeddableEmbedParam(embedParam);

  const isEmbedMobile = embedParam === "mobile" || embedParam === "1";

  if (typeof window !== "undefined" && isEmbed) {
    bootstrapEmbedSession(embedParam);
  }

  if (isLogin || isSignup || isOnboarding || isDownload || isLegal || isMarketing || isEmbedRoute || isTableside) {
    return <>{children}</>;
  }

  const showSidebar = !isEmbed || !isEmbedMobile;
  const showMobileHeader = !isEmbed || isEmbedMobile;
  const showMobileNav = !isEmbed || isEmbedMobile;
  const showDesktopTopBar = !isEmbed;

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
            {isEmbed && <EmbedSessionBootstrap />}
            <div className="flex min-h-screen min-w-0 overflow-x-hidden">
              {showSidebar && <Sidebar />}
              <div
                className={`flex min-w-0 flex-1 flex-col ${
                  isEmbedMobile
                    ? "pb-[calc(5rem+env(safe-area-inset-bottom,0px))]"
                    : showMobileNav
                      ? "pb-[calc(5rem+env(safe-area-inset-bottom,0px))] md:pb-0"
                      : ""
                }`}
              >
                {showMobileHeader && <MobileHeader forceShow={isEmbedMobile} />}
                {showDesktopTopBar && <DesktopTopBar />}
                {mainInner}
              </div>
            </div>
            {showMobileNav && <MobileNav forceShow={isEmbedMobile} />}
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
