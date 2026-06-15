import { PageHeader } from "@/components/ui";
import { KdsClient } from "@/components/kitchen/KdsClient";

export const metadata = {
  title: "Kitchen Display",
};

export default function KdsPage() {
  return (
    <div>
      <PageHeader
        title="Kitchen Display (KDS)"
        description="Tickets routed by station — Grill, Fry, Service Bar printer, and more"
      />
      <KdsClient />
    </div>
  );
}
