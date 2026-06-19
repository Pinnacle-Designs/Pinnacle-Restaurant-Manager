import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/auth";
import { requireSecureAuth } from "@/lib/api-auth";
import { isRateLimited } from "@/lib/rate-limit";
import { privateJsonResponse } from "@/lib/secure-response";
import { decryptTotpSecret, verifyMfaCode } from "@/lib/mfa";
import { bumpSessionVersion } from "@/lib/session-version";

export async function POST(request: NextRequest) {
  const { user, error } = await requireSecureAuth(request);
  if (error) return error;

  if (isRateLimited(`mfa-disable:${user!.id}`, 5, 60_000)) {
    return privateJsonResponse({ error: "Too many attempts" }, { status: 429 });
  }

  const body = await request.json();
  const password = String(body.password || "");
  const code = String(body.code || "").trim();

  if (!password || !code) {
    return privateJsonResponse({ error: "Password and verification code are required" }, { status: 400 });
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: user!.id },
    select: {
      passwordHash: true,
      mfaEnabled: true,
      totpSecretEnc: true,
      mfaBackupCodesHash: true,
    },
  });

  if (!dbUser || !verifyPassword(password, dbUser.passwordHash)) {
    return privateJsonResponse({ error: "Password is incorrect" }, { status: 401 });
  }

  if (!dbUser.mfaEnabled) {
    return privateJsonResponse({ error: "Two-factor authentication is not enabled" }, { status: 400 });
  }

  const secret = decryptTotpSecret(dbUser.totpSecretEnc);
  const verified = verifyMfaCode(secret, dbUser.mfaBackupCodesHash, code);
  if (!verified.ok) {
    return privateJsonResponse({ error: "Invalid verification code" }, { status: 401 });
  }

  await bumpSessionVersion(user!.id);

  await prisma.user.update({
    where: { id: user!.id },
    data: {
      mfaEnabled: false,
      totpSecretEnc: null,
      mfaPendingSecretEnc: null,
      mfaBackupCodesHash: null,
    },
  });

  return privateJsonResponse({ message: "Two-factor authentication disabled" });
}
