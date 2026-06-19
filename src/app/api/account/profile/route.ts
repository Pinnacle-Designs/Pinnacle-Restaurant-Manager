import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { createSessionToken, sessionCookieOptions } from "@/lib/auth";
import { requireSecureAuth } from "@/lib/api-auth";
import { isRateLimited } from "@/lib/rate-limit";
import { privateJsonResponse } from "@/lib/secure-response";

const MAX_NAME_LENGTH = 120;

export async function PATCH(request: NextRequest) {
  const { user, error } = await requireSecureAuth(request);
  if (error) return error;

  if (await isRateLimited(`profile:${user!.id}`, 20, 60_000)) {
    return privateJsonResponse(
      { error: "Too many profile updates. Try again shortly." },
      { status: 429 }
    );
  }

  const body = await request.json();
  const name = String(body.name || "").trim().slice(0, MAX_NAME_LENGTH);

  if (!name) {
    return privateJsonResponse({ error: "Name is required" }, { status: 400 });
  }

  const updated = await prisma.user.update({
    where: { id: user!.id },
    data: { name },
    select: { id: true, name: true, email: true, avatarUrl: true, role: true },
  });

  const response = privateJsonResponse({ user: updated });
  const token = await createSessionToken({
    ...user!,
    name: updated.name,
    avatarUrl: updated.avatarUrl,
  });
  response.cookies.set(sessionCookieOptions(token));
  return response;
}
