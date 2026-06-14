import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getEnrichedSessionUser } from "@/lib/location-plan";
import { OnboardingClient } from "@/components/onboarding/OnboardingClient";

export default async function OnboardingPage() {
  const user = await getEnrichedSessionUser();
  if (!user) redirect("/login?from=/onboarding");
  if (user.role !== "OWNER") redirect("/dashboard");
  if (user.setupComplete) redirect("/dashboard");

  return (
    <Suspense fallback={<div className="py-12 text-center text-sm text-slate-500">Loading…</div>}>
      <OnboardingClient />
    </Suspense>
  );
}
