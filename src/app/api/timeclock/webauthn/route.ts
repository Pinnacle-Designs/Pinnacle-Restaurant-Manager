import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAnyPermission } from "@/lib/api-auth";

export async function GET(request: NextRequest) {
  const { user, error } = await requireAnyPermission(request, ["clock_in"]);
  if (error) return error;

  const credentials = await prisma.webAuthnCredential.findMany({
    where: { userId: user!.id },
    select: {
      id: true,
      deviceLabel: true,
      createdAt: true,
      lastUsedAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({
    enrolled: credentials.length > 0,
    credentials: credentials.map((c) => ({
      ...c,
      createdAt: c.createdAt.toISOString(),
      lastUsedAt: c.lastUsedAt?.toISOString() ?? null,
    })),
  });
}
