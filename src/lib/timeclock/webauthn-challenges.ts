const challenges = new Map<string, { challenge: string; expires: number }>();

export function setWebAuthnChallenge(userId: string, challenge: string) {
  challenges.set(userId, { challenge, expires: Date.now() + 5 * 60 * 1000 });
}

export function consumeWebAuthnChallenge(userId: string, challenge: string): boolean {
  const entry = challenges.get(userId);
  if (!entry || entry.expires < Date.now() || entry.challenge !== challenge) {
    return false;
  }
  challenges.delete(userId);
  return true;
}
