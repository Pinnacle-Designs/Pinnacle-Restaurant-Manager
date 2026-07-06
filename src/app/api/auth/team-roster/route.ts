import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientIp } from "@/lib/client-ip";
import { isRateLimited } from "@/lib/rate-limit";
import { privateJsonResponse } from "@/lib/secure-response";
import { isValidTeamLoginCode } from "@/lib/staff-app-login";

export async function GET(request: NextRequest) {
  const ip = getClientIp(request);
  if (await isRateLimited(`team-roster:ip:${ip}`, 30, 60_000)) {
    return privateJsonResponse({ error: "Too many requests. Try again shortly." }, { status: 429 });
  }

  const code = request.nextUrl.searchParams.get("code")?.trim() ?? "";
  if (!isValidTeamLoginCode(code)) {
    return privateJsonResponse({ error: "Enter your restaurant team code" }, { status: 400 });
  }

  if (await isRateLimited(`team-roster:code:${code}`, 20, 60_000)) {
    return privateJsonResponse({ error: "Too many requests. Try again shortly." }, { status: 429 });
  }

  const location = await prisma.location.findFirst({
    where: { teamLoginCode: code, active: true },
    select: { id: true, name: true },
  });

  if (!location) {
    return privateJsonResponse({ error: "Restaurant not found" }, { status: 404 });
  }

  const staff = await prisma.staffMember.findMany({
    where: {
      locationId: location.id,
      active: true,
      userId: { not: null },
    },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      role: true,
      clockPinHash: true,
    },
  });

  return privateJsonResponse({
    locationName: location.name,
    staff: staff.map((member) => ({
      id: member.id,
      name: member.name,
      role: member.role,
      needsPinSetup: !member.clockPinHash,
    })),
  });
}
