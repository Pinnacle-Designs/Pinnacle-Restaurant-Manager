import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePlatformAdmin } from "@/lib/api-platform-admin";
import { privateJsonResponse } from "@/lib/secure-response";

export async function GET(request: NextRequest) {
  const { error } = await requirePlatformAdmin(request);
  if (error) return error;

  const rows = await prisma.activityLog.findMany({
    where: { entity: "pitch_deck", action: "REQUEST" },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      details: true,
      createdAt: true,
    },
  });

  const inquiries = rows.map((row) => {
    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(row.details || "{}") as Record<string, unknown>;
    } catch {
      parsed = { raw: row.details };
    }
    return {
      id: row.id,
      name: String(parsed.name || ""),
      email: String(parsed.email || ""),
      company: parsed.company ? String(parsed.company) : null,
      interest: String(parsed.interest || ""),
      message: parsed.message ? String(parsed.message) : null,
      createdAt: row.createdAt.toISOString(),
    };
  });

  return privateJsonResponse({ inquiries });
}
