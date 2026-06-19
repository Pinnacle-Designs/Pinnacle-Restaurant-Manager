import { createHash, randomBytes } from "crypto";
import { prisma } from "./prisma";

export type AuthTokenType = "EMAIL_VERIFY" | "PASSWORD_RESET";

const TOKEN_BYTES = 32;

function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export async function createAuthToken(
  userId: string,
  type: AuthTokenType,
  ttlMs: number
): Promise<string> {
  const raw = randomBytes(TOKEN_BYTES).toString("base64url");
  await prisma.authToken.create({
    data: {
      userId,
      type,
      tokenHash: hashToken(raw),
      expiresAt: new Date(Date.now() + ttlMs),
    },
  });
  return raw;
}

export async function consumeAuthToken(raw: string, type: AuthTokenType) {
  const tokenHash = hashToken(raw.trim());
  const record = await prisma.authToken.findFirst({
    where: {
      tokenHash,
      type,
      usedAt: null,
      expiresAt: { gt: new Date() },
    },
    include: { user: true },
  });
  if (!record) return null;

  await prisma.authToken.update({
    where: { id: record.id },
    data: { usedAt: new Date() },
  });

  return record.user;
}
