import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientIp } from "@/lib/client-ip";
import { isRateLimited } from "@/lib/rate-limit";
import { privateJsonResponse } from "@/lib/secure-response";
import { parseMfaPendingToken } from "@/lib/mfa-pending";
import {
  decryptTotpSecret,
  removeUsedBackupCode,
  verifyMfaCode,
} from "@/lib/mfa";
import { completeUserLogin } from "@/lib/complete-login";

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  if (isRateLimited(`mfa:ip:${ip}`, 30, 60_000)) {
    return privateJsonResponse({ error: "Too many attempts. Try again shortly." }, { status: 429 });
  }

  const body = await request.json();
  const pendingToken = String(body.pendingToken || "");
  const code = String(body.code || "").trim();
  const forEmbed = body.embed === true;

  if (!pendingToken || !code) {
    return privateJsonResponse({ error: "Verification code required" }, { status: 400 });
  }

  const pending = await parseMfaPendingToken(pendingToken);
  if (!pending) {
    return privateJsonResponse({ error: "Session expired. Sign in again." }, { status: 401 });
  }

  if (isRateLimited(`mfa:user:${pending.userId}`, 10, 60_000)) {
    return privateJsonResponse({ error: "Too many attempts. Try again shortly." }, { status: 429 });
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: pending.userId },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      locationId: true,
      active: true,
      mfaEnabled: true,
      totpSecretEnc: true,
      mfaBackupCodesHash: true,
    },
  });

  if (!dbUser?.active || !dbUser.mfaEnabled) {
    return privateJsonResponse({ error: "Session expired. Sign in again." }, { status: 401 });
  }

  const secret = decryptTotpSecret(dbUser.totpSecretEnc);
  const result = verifyMfaCode(secret, dbUser.mfaBackupCodesHash, code);
  if (!result.ok) {
    return privateJsonResponse({ error: "Invalid verification code" }, { status: 401 });
  }

  if (result.usedBackupIndex != null && dbUser.mfaBackupCodesHash) {
    const nextHashes = removeUsedBackupCode(dbUser.mfaBackupCodesHash, result.usedBackupIndex);
    await prisma.user.update({
      where: { id: dbUser.id },
      data: { mfaBackupCodesHash: nextHashes },
    });
  }

  return completeUserLogin({
    request,
    user: {
      id: dbUser.id,
      email: dbUser.email,
      name: dbUser.name,
      role: dbUser.role,
      locationId: dbUser.locationId,
    },
    email: dbUser.email,
    forEmbed,
  });
}
