import { redirect } from "next/navigation";
import { getEnrichedSessionUser } from "@/lib/location-plan";
import { hasPermissionInList } from "@/lib/permissions";
import { PageHeader } from "@/components/ui";
import { BackOfficeClient } from "@/components/back-office/BackOfficeClient";

export default async function BackOfficePage() {
  const user = await getEnrichedSessionUser();
  if (!user || !hasPermissionInList(user.permissions, "view_analytics")) {
    redirect("/dashboard");
  }

  return (
    <div>
      <PageHeader
        title="Back Office"
        description="Analytics & reporting — raw numbers translated into actionable decisions"
      />
      <BackOfficeClient />
    </div>
  );
}
