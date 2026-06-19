import { decryptSecret, encryptSecret } from "./secret-crypto";

const PREFIX = "enc:v1:";

/** Encrypt OAuth refresh tokens and other provider credentials at rest. */
export function encryptCredential(value: string | null | undefined): string | null {
  if (!value) return null;
  if (value.startsWith(PREFIX)) return value;
  return `${PREFIX}${encryptSecret(value)}`;
}

/** Decrypt stored credentials; legacy plaintext values pass through unchanged. */
export function decryptCredential(value: string | null | undefined): string | null {
  if (!value) return null;
  if (!value.startsWith(PREFIX)) return value;
  return decryptSecret(value.slice(PREFIX.length));
}
