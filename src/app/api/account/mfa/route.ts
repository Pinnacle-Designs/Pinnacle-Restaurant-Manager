import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSecureAuth } from "@/lib/api-auth";
import { privateJsonResponse } from "@/lib/secure-response";

export async function GET(request: NextRequest) {
  const { user, error } = await requireSecureAuth(request);
  if (error) return error;

  const dbUser = await prisma.user.findUnique({
    where: { id: user!.id },
    select: {
      mfaEnabled: true,
      mfaBackupCodesHash: true,
    },
  });

  let backupCodesRemaining = 0;
  if (dbUser?.mfaBackupCodesHash) {
    try {
      backupCodesRemaining = (JSON.parse(dbUser.mfaBackupCodesHash) as string[]).length;
    } catch {
      backupCodesRemaining = 0;
    }
  }

  return privateJsonResponse({
    mfaEnabled: dbUser?.mfaEnabled ?? false,
    backupCodesRemaining,
  });
}
