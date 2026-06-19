import { NextRequest } from "next/server";
import { hashPassword } from "@/lib/auth";
import { consumeAuthToken } from "@/lib/auth-tokens";
import { prisma } from "@/lib/prisma";
import { getClientIp } from "@/lib/client-ip";
import { isRateLimited } from "@/lib/rate-limit";
import { validatePassword } from "@/lib/password-policy";
import { bumpSessionVersion } from "@/lib/session-version";
import { privateJsonResponse } from "@/lib/secure-response";

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  if (await isRateLimited(`reset-password:ip:${ip}`, 15, 60_000)) {
    return privateJsonResponse({ error: "Too many requests. Try again shortly." }, { status: 429 });
  }

  const body = await request.json();
  const token = String(body.token || "").trim();
  const password = String(body.password || "");

  if (!token || !password) {
    return privateJsonResponse({ error: "Token and new password are required" }, { status: 400 });
  }

  const passwordError = validatePassword(password);
  if (passwordError) {
    return privateJsonResponse({ error: passwordError }, { status: 400 });
  }

  const user = await consumeAuthToken(token, "PASSWORD_RESET");
  if (!user || !user.active) {
    return privateJsonResponse({ error: "Invalid or expired reset link" }, { status: 400 });
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: hashPassword(password) },
  });
  await bumpSessionVersion(user.id);

  return privateJsonResponse({ message: "Password updated. You can sign in now." });
}
