import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword, verifyPassword } from "@/lib/auth";
import { requireSecureAuth } from "@/lib/api-auth";
import { isRateLimited } from "@/lib/rate-limit";
import { validatePassword } from "@/lib/password-policy";
import { privateJsonResponse } from "@/lib/secure-response";
import { bumpSessionVersion } from "@/lib/session-version";

export async function POST(request: NextRequest) {
  const { user, error } = await requireSecureAuth(request);
  if (error) return error;

  if (isRateLimited(`password:${user!.id}`, 5, 60_000)) {
    return privateJsonResponse(
      { error: "Too many password attempts. Try again shortly." },
      { status: 429 }
    );
  }

  const body = await request.json();
  const currentPassword = String(body.currentPassword || "");
  const newPassword = String(body.newPassword || "");

  if (!currentPassword || !newPassword) {
    return privateJsonResponse(
      { error: "Current and new password are required" },
      { status: 400 }
    );
  }

  const passwordError = validatePassword(newPassword);
  if (passwordError) {
    return privateJsonResponse({ error: passwordError }, { status: 400 });
  }

  if (currentPassword === newPassword) {
    return privateJsonResponse(
      { error: "New password must be different from your current password" },
      { status: 400 }
    );
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: user!.id },
    select: { passwordHash: true },
  });

  if (!dbUser || !verifyPassword(currentPassword, dbUser.passwordHash)) {
    return privateJsonResponse({ error: "Current password is incorrect" }, { status: 401 });
  }

  await prisma.user.update({
    where: { id: user!.id },
    data: { passwordHash: hashPassword(newPassword) },
  });

  await bumpSessionVersion(user!.id);

  return privateJsonResponse({
    message: "Password updated. Sign in again on your other devices.",
    sessionRevoked: true,
  });
}
