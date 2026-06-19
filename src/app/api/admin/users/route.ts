import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePlatformAdmin } from "@/lib/api-platform-admin";
import { privateJsonResponse } from "@/lib/secure-response";

export async function GET(request: NextRequest) {
  const { error } = await requirePlatformAdmin(request);
  if (error) return error;

  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      active: true,
      isPlatformAdmin: true,
      createdAt: true,
      location: { select: { id: true, name: true } },
    },
  });

  return privateJsonResponse({
    users: users.map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
      active: u.active,
      isPlatformAdmin: u.isPlatformAdmin,
      locationId: u.location?.id ?? null,
      locationName: u.location?.name ?? null,
      createdAt: u.createdAt.toISOString(),
    })),
  });
}

export async function PATCH(request: NextRequest) {
  const { error } = await requirePlatformAdmin(request);
  if (error) return error;

  const body = await request.json();
  const userId = String(body.userId || "");
  if (!userId) {
    return privateJsonResponse({ error: "userId is required" }, { status: 400 });
  }

  const data: Record<string, unknown> = {};
  if (body.active !== undefined) data.active = body.active === true;
  if (body.isPlatformAdmin !== undefined) data.isPlatformAdmin = body.isPlatformAdmin === true;
  if (body.active === false) {
    data.sessionVersion = { increment: 1 };
  }

  if (!Object.keys(data).length) {
    return privateJsonResponse({ error: "No valid fields to update" }, { status: 400 });
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data,
    select: { id: true, email: true, active: true, isPlatformAdmin: true },
  });

  return privateJsonResponse({ user: updated });
}
