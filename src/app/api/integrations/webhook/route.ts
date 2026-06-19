import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSecureAuth } from "@/lib/api-auth";
import { privateJsonResponse } from "@/lib/secure-response";

/**
 * Generic inbound webhook for Zapier / Make / n8n and custom middleware.
 * Validates optional INTEGRATION_WEBHOOK_SECRET header when configured.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.INTEGRATION_WEBHOOK_SECRET;
  let user = null;

  if (secret) {
    const header = request.headers.get("x-pinnacle-webhook-secret");
    if (header !== secret) {
      return privateJsonResponse({ error: "Unauthorized" }, { status: 401 });
    }
  } else {
    const auth = await requireSecureAuth(request);
    if (auth.error) return auth.error;
    user = auth.user;
  }

  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    return privateJsonResponse({ error: "Invalid JSON body" }, { status: 400 });
  }

  const event = String(body.event ?? "webhook.received");
  const source = String(body.source ?? "automation");
  const locationId = String(body.locationId ?? user?.locationId ?? "").trim();

  if (locationId) {
    await prisma.activityLog.create({
      data: {
        locationId,
        action: "WEBHOOK",
        entity: "integration",
        entityId: source,
        details: `${event} from ${source}`,
      },
    });
  }

  return privateJsonResponse({
    ok: true,
    event,
    source,
    message: "Webhook received. Map payloads in Account → Integrations → Automation bridge.",
  });
}

export async function GET() {
  return privateJsonResponse({
    endpoint: "/api/integrations/webhook",
    methods: ["POST"],
    auth: "Optional session cookie, or x-pinnacle-webhook-secret when INTEGRATION_WEBHOOK_SECRET is set",
    body: { event: "string", source: "zapier|make|n8n|custom", locationId: "string", payload: "any" },
  });
}
