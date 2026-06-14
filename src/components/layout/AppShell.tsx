"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { MobileNav } from "@/components/layout/MobileNav";
import { MobileHeader } from "@/components/layout/MobileHeader";
import { NotificationProvider } from "@/components/notifications/NotificationProvider";
import { AuthProvider } from "@/components/auth/AuthProvider";

function AppShellInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isMarketing = pathname === "/" || pathname === "/demo";
  const isLogin = pathname === "/login";
  const isEmbedRoute = pathname === "/embed";
  const isEmbed = searchParams.get("embed") === "1";

  if (isLogin || isMarketing || isEmbedRoute) {
    return <>{children}</>;
  }

  const mainInner = isEmbed ? (
    <main className="min-h-screen flex-1 overflow-auto">
      <div className="px-2 py-3 sm:px-4 sm:py-4">{children}</div>
    </main>
  ) : (
    <main className="flex-1">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">{children}</div>
    </main>
  );

  return (
    <AuthProvider>
      <NotificationProvider>
        <div className="flex min-h-screen">
          {!isEmbed && <Sidebar />}
          <div className={`flex flex-1 flex-col ${isEmbed ? "" : "pb-20 md:pb-0"}`}>
            {!isEmbed && <MobileHeader />}
            {mainInner}
          </div>
        </div>
        {!isEmbed && <MobileNav />}
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
