import { getSecret } from "./session-secret";

const MFA_PENDING_MAX_AGE_MS = 5 * 60 * 1000;

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(str: string): Uint8Array {
  const base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function importHmacKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(getSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

async function signPayload(payload: string): Promise<string> {
  const key = await importHmacKey();
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return toBase64Url(new Uint8Array(sig));
}

async function verifyPayload(payload: string, signature: string): Promise<boolean> {
  try {
    const key = await importHmacKey();
    const sigBytes = Uint8Array.from(fromBase64Url(signature));
    return crypto.subtle.verify(
      "HMAC",
      key,
      sigBytes,
      new TextEncoder().encode(payload)
    );
  } catch {
    return false;
  }
}

export async function createMfaPendingToken(userId: string): Promise<string> {
  const payload = toBase64Url(
    new TextEncoder().encode(
      JSON.stringify({
        userId,
        exp: Date.now() + MFA_PENDING_MAX_AGE_MS,
      })
    )
  );
  const sig = await signPayload(payload);
  return `${payload}.${sig}`;
}

export async function parseMfaPendingToken(
  token: string
): Promise<{ userId: string } | null> {
  try {
    const [payload, sig] = token.split(".");
    if (!payload || !sig) return null;
    if (!(await verifyPayload(payload, sig))) return null;
    const decoded = new TextDecoder().decode(fromBase64Url(payload));
    const data = JSON.parse(decoded) as { userId: string; exp: number };
    if (!data.userId || data.exp < Date.now()) return null;
    return { userId: data.userId };
  } catch {
    return null;
  }
}
