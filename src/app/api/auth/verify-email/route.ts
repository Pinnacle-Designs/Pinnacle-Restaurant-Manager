import { NextRequest } from "next/server";
import { consumeAuthToken } from "@/lib/auth-tokens";
import { prisma } from "@/lib/prisma";
import { applyAuthCookies } from "@/lib/auth-cookies";
import { getSessionUserFromRequest } from "@/lib/auth";
import { privateJsonResponse } from "@/lib/secure-response";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token")?.trim();
  if (!token) {
    return privateJsonResponse({ error: "Missing verification token" }, { status: 400 });
  }

  const user = await consumeAuthToken(token, "EMAIL_VERIFY");
  if (!user) {
    return privateJsonResponse({ error: "Invalid or expired verification link" }, { status: 400 });
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { emailVerifiedAt: new Date() },
  });

  const sessionUser = await getSessionUserFromRequest(request);
  const response = privateJsonResponse({ message: "Email verified successfully." });

  if (sessionUser?.id === user.id) {
    await applyAuthCookies(response, { ...sessionUser, emailVerifiedAt: new Date().toISOString() });
  }

  return response;
}
