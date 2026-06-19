import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { createAuthToken } from "@/lib/auth-tokens";
import { sendVerificationEmail } from "@/lib/email";
import { prisma } from "@/lib/prisma";
import { isRateLimited } from "@/lib/rate-limit";
import { privateJsonResponse } from "@/lib/secure-response";

export async function POST(request: NextRequest) {
  const { user, error } = await requireAuth(request);
  if (error || !user) return error!;

  if (user.emailVerifiedAt) {
    return privateJsonResponse({ message: "Email is already verified." });
  }

  if (await isRateLimited(`verify-resend:${user.id}`, 3, 60 * 60_000)) {
    return privateJsonResponse(
      { error: "Too many verification emails sent. Try again later." },
      { status: 429 }
    );
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { email: true, emailVerifiedAt: true },
  });
  if (!dbUser || dbUser.emailVerifiedAt) {
    return privateJsonResponse({ message: "Email is already verified." });
  }

  const token = await createAuthToken(user.id, "EMAIL_VERIFY", 24 * 60 * 60_000);
  const result = await sendVerificationEmail(dbUser.email, token);

  return privateJsonResponse({
    message: result.sent
      ? "Verification email sent."
      : "Verification email queued (check server logs in development).",
    devLink: result.devLink,
  });
}
