import { NextRequest } from "next/server";
import { requireSecureAuth } from "@/lib/api-auth";
import { privateJsonResponse } from "@/lib/secure-response";
import { getIntegrationHealth, summarizeIntegrationHealth } from "@/lib/integrations/health";

/** Integration health check — shows which external systems are live, demo, or optional. */
export async function GET(request: NextRequest) {
  const { error } = await requireSecureAuth(request);
  if (error) return error;

  const statuses = getIntegrationHealth();
  return privateJsonResponse(summarizeIntegrationHealth(statuses));
}
