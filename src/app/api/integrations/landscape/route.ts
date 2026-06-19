import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSecureAuth } from "@/lib/api-auth";
import { getVerifiedOwnerLocationId } from "@/lib/billing-auth";
import { privateJsonResponse } from "@/lib/secure-response";
import {
  INTEGRATION_LANDSCAPE,
  landscapeStats,
  searchLandscapeSystems,
  type ApiTier,
} from "@/lib/integrations/landscape";

export async function GET(request: NextRequest) {
  const { user, error } = await requireSecureAuth(request);
  if (error) return error;

  const q = request.nextUrl.searchParams.get("q") ?? "";
  const category = request.nextUrl.searchParams.get("category") ?? undefined;
  const apiTier = (request.nextUrl.searchParams.get("apiTier") as ApiTier | null) ?? undefined;
  const mode = request.nextUrl.searchParams.get("mode");

  if (mode === "full") {
    return privateJsonResponse({
      ...INTEGRATION_LANDSCAPE,
      stats: landscapeStats(),
    });
  }

  const systems = searchLandscapeSystems(q, category, apiTier);

  return privateJsonResponse({
    systems,
    categories: INTEGRATION_LANDSCAPE.categories,
    priorities: INTEGRATION_LANDSCAPE.priorities,
    functions: INTEGRATION_LANDSCAPE.functions,
    stats: landscapeStats(),
    query: { q, category, apiTier },
  });
}

/** Log owner interest in a partner-only integration. */
export async function POST(request: NextRequest) {
  const { user, error } = await requireSecureAuth(request);
  if (error) return error;

  const { locationId } = await getVerifiedOwnerLocationId(user!);
  const activeLocationId = locationId ?? user!.locationId;
  if (!activeLocationId) {
    return privateJsonResponse({ error: "No location assigned" }, { status: 404 });
  }

  const body = await request.json();
  const systemId = String(body.systemId ?? "").trim();
  const systemName = String(body.systemName ?? systemId).trim();
  if (!systemId) {
    return privateJsonResponse({ error: "systemId required" }, { status: 400 });
  }

  await prisma.activityLog.create({
    data: {
      locationId: activeLocationId,
      action: "INTEGRATION_REQUEST",
      entity: "integration",
      entityId: systemId,
      details: `${user!.name} requested integration: ${systemName}`,
    },
  });

  return privateJsonResponse({
    message: `Request logged for ${systemName}. We'll prioritize partner API access.`,
  });
}
