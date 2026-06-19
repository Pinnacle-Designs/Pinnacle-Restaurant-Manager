import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSecureAuth } from "@/lib/api-auth";
import { isRateLimited } from "@/lib/rate-limit";
import { privateJsonResponse } from "@/lib/secure-response";
import {
  buildTotpUri,
  encryptTotpSecret,
  generateTotpSecret,
} from "@/lib/mfa";

export async function POST(request: NextRequest) {
  const { user, error } = await requireSecureAuth(request);
  if (error) return error;

  if (isRateLimited(`mfa-setup:${user!.id}`, 5, 60_000)) {
    return privateJsonResponse({ error: "Too many setup attempts" }, { status: 429 });
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: user!.id },
    select: { mfaEnabled: true, email: true },
  });

  if (dbUser?.mfaEnabled) {
    return privateJsonResponse({ error: "Two-factor authentication is already enabled" }, { status: 400 });
  }

  const secret = generateTotpSecret();
  await prisma.user.update({
    where: { id: user!.id },
    data: { mfaPendingSecretEnc: encryptTotpSecret(secret) },
  });

  return privateJsonResponse({
    otpauthUrl: buildTotpUri(dbUser!.email, secret),
    secret,
  });
}
