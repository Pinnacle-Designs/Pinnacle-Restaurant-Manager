import { prisma } from "@/lib/prisma";

const CHALLENGE_TTL_MS = 5 * 60 * 1000;

export async function setWebAuthnChallenge(userId: string, challenge: string) {
  await pruneExpiredWebAuthnChallenges();
  const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MS);
  await prisma.webAuthnChallenge.upsert({
    where: { userId },
    create: { userId, challenge, expiresAt },
    update: { challenge, expiresAt },
  });
}

export async function consumeWebAuthnChallenge(
  userId: string,
  challenge: string
): Promise<boolean> {
  const entry = await prisma.webAuthnChallenge.findUnique({ where: { userId } });
  if (!entry || entry.expiresAt < new Date() || entry.challenge !== challenge) {
    return false;
  }
  await prisma.webAuthnChallenge.delete({ where: { userId } });
  return true;
}

/** Remove expired challenges (safe to call on each challenge write). */
export async function pruneExpiredWebAuthnChallenges() {
  await prisma.webAuthnChallenge.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
}
