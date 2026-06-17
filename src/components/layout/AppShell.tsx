"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { MobileNav } from "@/components/layout/MobileNav";
import { MobileHeader } from "@/components/layout/MobileHeader";
import { PrintReportStamp } from "@/components/layout/PrintReportStamp";
import { NotificationProvider } from "@/components/notifications/NotificationProvider";
import { AuthProvider } from "@/components/auth/AuthProvider";
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
    <main className="min-h-screen flex-1 overflow-auto">
      <div className="px-2 py-3 sm:px-4 sm:py-4">
        <PrintReportStamp />
        {children}
      </div>
    </main>
  ) : (
    <main className="flex-1">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <PrintReportStamp />
        {children}
      </div>
    </main>
  );

  return (
    <AuthProvider>
      <NotificationProvider>
        <div className="flex min-h-screen">
          {showSidebar && <Sidebar />}
          <div className={`flex flex-1 flex-col ${showMobileChrome ? "pb-20 md:pb-0" : ""}`}>
            {showMobileChrome && <MobileHeader />}
            {mainInner}
          </div>
        </div>
        {showMobileChrome && <MobileNav />}
      </NotificationProvider>
    </AuthProvider>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<>{children}</>}>
      <AppShellInner>{children}</AppShellInner>
    </Suspense>
  );
}
