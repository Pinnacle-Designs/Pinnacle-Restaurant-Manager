import { redirect } from "next/navigation";
import { getEnrichedSessionUser } from "@/lib/location-plan";
import { hasPermissionInList } from "@/lib/permissions";
import { AnalyticsClient } from "@/components/analytics/AnalyticsClient";

export default async function AnalyticsPage() {
  const user = await getEnrichedSessionUser();
  if (!user || !hasPermissionInList(user.permissions, "view_analytics")) {
    redirect("/dashboard");
  }

  return <AnalyticsClient />;
}
