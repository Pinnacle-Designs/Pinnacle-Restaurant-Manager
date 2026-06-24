import "@/app/globals.css";
import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { Inter } from "next/font/google";
import { AppShell } from "@/components/layout/AppShell";
import { PwaBootstrap } from "@/components/pwa/PwaBootstrap";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Pinnacle Restaurant Manager — AI-Powered Restaurant Operations",
  description:
    "All-in-one restaurant management with live demo — orders, inventory, staff, finances, 12-tab analytics, and an AI command center that answers profit, labor, and ops questions from live data.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Pinnacle",
  },
  icons: {
    icon: [{ url: "/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: "/icon-192.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#0f172a",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.className} bg-slate-50 text-slate-900 antialiased`}>
        <Script src="/embed-bootstrap.js" strategy="beforeInteractive" />
        <PwaBootstrap />
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
