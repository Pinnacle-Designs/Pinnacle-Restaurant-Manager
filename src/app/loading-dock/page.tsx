import { PageHeader } from "@/components/ui";
import { LoadingDockClient } from "@/components/loading-dock/LoadingDockClient";

export default function LoadingDockPage() {
  return (
    <div>
      <PageHeader
        title="Loading Dock"
        description="Purchasing & receiving — catch overcharges before you write the check"
      />
      <LoadingDockClient />
    </div>
  );
}
