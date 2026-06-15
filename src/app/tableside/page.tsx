import { Suspense } from "react";
import { PageHeader } from "@/components/ui";
import { TablesideMenuClient } from "@/components/menu/TablesideMenuClient";

export const metadata = {
  title: "Tableside Menu",
  description: "Guest QR menu — synced from One Menu",
};

export default function TablesidePage() {
  return (
    <div className="!p-0">
      <div className="sr-only">
        <PageHeader title="Tableside menu" description="Guest-facing QR menu" />
      </div>
      <Suspense fallback={<div className="p-8 text-center text-slate-500">Loading menu…</div>}>
        <TablesideMenuClient />
      </Suspense>
    </div>
  );
}
