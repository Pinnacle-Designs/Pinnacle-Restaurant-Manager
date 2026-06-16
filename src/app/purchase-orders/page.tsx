import { PageHeader } from "@/components/ui";
import { LoadingDockClient } from "@/components/loading-dock/LoadingDockClient";

export default function PurchaseOrdersPage() {
  return (
    <div>
      <PageHeader
        title="Purchase Orders"
        description="Smart draft POs per vendor, EDI catalogs, cross-vendor bidding, receiving, and invoice matching"
      />
      <LoadingDockClient />
    </div>
  );
}
