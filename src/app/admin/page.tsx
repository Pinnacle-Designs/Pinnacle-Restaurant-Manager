import { redirect } from "next/navigation";
import { getEnrichedSessionUser } from "@/lib/location-plan";
import { AdminClient } from "@/components/admin/AdminClient";

export default async function AdminPage() {
  const user = await getEnrichedSessionUser();
  if (!user) redirect("/login?from=/admin");
  if (!user.isPlatformAdmin) redirect("/dashboard");

  return <AdminClient />;
}
