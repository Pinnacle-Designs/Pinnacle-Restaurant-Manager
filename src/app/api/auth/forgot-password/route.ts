import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { createAuthToken } from "@/lib/auth-tokens";
import { sendPasswordResetEmail } from "@/lib/email";
import { getClientIp } from "@/lib/client-ip";
import { isRateLimited } from "@/lib/rate-limit";
import { privateJsonResponse } from "@/lib/secure-response";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  if (await isRateLimited(`forgot-password:ip:${ip}`, 10, 60_000)) {
    return privateJsonResponse({ error: "Too many requests. Try again shortly." }, { status: 429 });
  }

  const body = await request.json();
  const email = String(body.email || "").trim().toLowerCase();

  if (!email || !EMAIL_RE.test(email)) {
    return privateJsonResponse({ error: "Enter a valid email address" }, { status: 400 });
  }

  if (await isRateLimited(`forgot-password:email:${email}`, 3, 60 * 60_000)) {
    return privateJsonResponse(
      { message: "If an account exists for that email, a reset link has been sent." }
    );
  }

  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, active: true } });
  if (user?.active) {
    const token = await createAuthToken(user.id, "PASSWORD_RESET", 60 * 60_000);
    await sendPasswordResetEmail(email, token);
  }

  return privateJsonResponse({
    message: "If an account exists for that email, a reset link has been sent.",
  });
}
