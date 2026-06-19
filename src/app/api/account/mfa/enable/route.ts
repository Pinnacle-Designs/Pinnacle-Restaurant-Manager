import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/auth";
import { requireSecureAuth } from "@/lib/api-auth";
import { isRateLimited } from "@/lib/rate-limit";
import { privateJsonResponse } from "@/lib/secure-response";
import {
  decryptTotpSecret,
  generateBackupCodes,
  serializeBackupHashes,
  verifyTotpCode,
} from "@/lib/mfa";
import { bumpSessionVersion } from "@/lib/session-version";
import { applyAuthCookies } from "@/lib/auth-cookies";

export async function POST(request: NextRequest) {
  const { user, error } = await requireSecureAuth(request);
  if (error) return error;

  if (await isRateLimited(`mfa-enable:${user!.id}`, 8, 60_000)) {
    return privateJsonResponse({ error: "Too many attempts" }, { status: 429 });
  }

  const body = await request.json();
  const code = String(body.code || "").trim();
  const password = String(body.password || "");

  if (!code || !password) {
    return privateJsonResponse({ error: "Password and verification code are required" }, { status: 400 });
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: user!.id },
    select: {
      passwordHash: true,
      mfaEnabled: true,
      mfaPendingSecretEnc: true,
    },
  });

  if (!dbUser || !verifyPassword(password, dbUser.passwordHash)) {
    return privateJsonResponse({ error: "Password is incorrect" }, { status: 401 });
  }

  if (dbUser.mfaEnabled) {
    return privateJsonResponse({ error: "Two-factor authentication is already enabled" }, { status: 400 });
  }

  const pendingSecret = decryptTotpSecret(dbUser.mfaPendingSecretEnc);
  if (!pendingSecret || !verifyTotpCode(pendingSecret, code)) {
    return privateJsonResponse({ error: "Invalid authenticator code" }, { status: 400 });
  }

  const { plain, hashed } = generateBackupCodes();
  await bumpSessionVersion(user!.id);

  await prisma.user.update({
    where: { id: user!.id },
    data: {
      mfaEnabled: true,
      totpSecretEnc: dbUser.mfaPendingSecretEnc,
      mfaPendingSecretEnc: null,
      mfaBackupCodesHash: serializeBackupHashes(hashed),
    },
  });

  const response = privateJsonResponse({
    message: "Two-factor authentication enabled",
    backupCodes: plain,
  });
  await applyAuthCookies(response, { ...user!, mfaEnabled: true });
  return response;
}
