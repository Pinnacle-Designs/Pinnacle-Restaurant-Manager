import { PageHeader } from "@/components/ui";
import { KitchenClient } from "@/components/kitchen/KitchenClient";

export default function KitchenPage() {
  return (
    <div>
      <PageHeader
        title="The Kitchen"
        description="Culinary & recipe management — raw ingredients change shape before they reach the guest"
      />
      <KitchenClient />
    </div>
  );
}
