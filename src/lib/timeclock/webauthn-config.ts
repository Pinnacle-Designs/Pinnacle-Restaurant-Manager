export function getWebAuthnRpId(): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  try {
    return new URL(appUrl).hostname;
  } catch {
    return "localhost";
  }
}

export function getWebAuthnOrigin(): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  return appUrl.replace(/\/$/, "");
}
