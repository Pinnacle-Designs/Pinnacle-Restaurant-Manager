import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePlatformAdmin } from "@/lib/api-platform-admin";
import { privateJsonResponse } from "@/lib/secure-response";

export async function GET(request: NextRequest) {
  const { error } = await requirePlatformAdmin(request);
  if (error) return error;

  const locations = await prisma.location.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      plan: true,
      active: true,
      setupComplete: true,
      autopayEnabled: true,
      billingEmail: true,
      createdAt: true,
      _count: { select: { users: true } },
      paymentProviderConnections: {
        where: { purpose: "SUBSCRIPTION" },
        select: { provider: true, status: true },
      },
    },
  });

  return privateJsonResponse({
    locations: locations.map((loc) => ({
      id: loc.id,
      name: loc.name,
      plan: loc.plan,
      active: loc.active,
      setupComplete: loc.setupComplete,
      autopayEnabled: loc.autopayEnabled,
      billingEmail: loc.billingEmail,
      userCount: loc._count.users,
      subscriptionProvider: loc.paymentProviderConnections[0]?.provider ?? "MANUAL",
      subscriptionStatus: loc.paymentProviderConnections[0]?.status ?? null,
      createdAt: loc.createdAt.toISOString(),
    })),
  });
}
