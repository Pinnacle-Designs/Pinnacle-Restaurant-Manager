import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePlatformAdmin } from "@/lib/api-platform-admin";
import { parsePlanId } from "@/lib/plans";
import { privateJsonResponse } from "@/lib/secure-response";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requirePlatformAdmin(request);
  if (error) return error;

  const { id } = await params;
  const body = await request.json();

  const data: Record<string, unknown> = {};

  if (body.active !== undefined) data.active = body.active === true;
  if (body.setupComplete !== undefined) data.setupComplete = body.setupComplete === true;
  const plan = body.plan != null ? parsePlanId(body.plan) : null;
  if (plan) data.plan = plan;

  if (!Object.keys(data).length) {
    return privateJsonResponse({ error: "No valid fields to update" }, { status: 400 });
  }

  const updated = await prisma.location.update({
    where: { id },
    data,
    select: {
      id: true,
      name: true,
      plan: true,
      active: true,
      setupComplete: true,
      autopayEnabled: true,
    },
  });

  return privateJsonResponse({ location: updated });
}
