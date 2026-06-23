import {
  PLAN_DEMO_USERS,
  planDemoLoginEnabled,
  seedPlanDemoWorkspaces,
} from "@/lib/demo-users";
import { privateJsonResponse } from "@/lib/secure-response";

export async function GET() {
  if (!planDemoLoginEnabled()) {
    return privateJsonResponse({ enabled: false, accounts: [] });
  }

  return privateJsonResponse({
    enabled: true,
    password: PLAN_DEMO_USERS[0]?.password ?? "demo1234",
    accounts: PLAN_DEMO_USERS.map((u) => ({
      email: u.email,
      plan: u.plan,
      locationName: u.locationName,
    })),
  });
}

export async function POST() {
  if (!planDemoLoginEnabled()) {
    return privateJsonResponse({ error: "Not found" }, { status: 404 });
  }

  const accounts = await seedPlanDemoWorkspaces();
  return privateJsonResponse({
    message: "Plan demo accounts ready",
    accounts: accounts.map(({ email, plan, locationName }) => ({
      email,
      plan,
      locationName,
    })),
  });
}
