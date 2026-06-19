export function getSecret(): string {
  const secret = process.env.AUTH_SECRET?.trim();
  if (secret) {
    if (process.env.NODE_ENV === "production" && secret.length < 32) {
      throw new Error("AUTH_SECRET must be at least 32 characters in production");
    }
    return secret;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("AUTH_SECRET must be set in production");
  }
  return "pinnacle-dev-secret-change-me";
}
