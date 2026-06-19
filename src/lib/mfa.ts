import { randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { TOTP, Secret } from "otpauth";
import { decryptSecret, encryptSecret } from "./secret-crypto";

const ISSUER = "Pinnacle Restaurant Manager";
const BACKUP_CODE_COUNT = 8;

function hashBackupCode(code: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(code, salt, 32).toString("hex");
  return `${salt}:${hash}`;
}

function verifyBackupCode(code: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const test = scryptSync(code, salt, 32);
  const target = Buffer.from(hash, "hex");
  if (test.length !== target.length) return false;
  return timingSafeEqual(test, target);
}

export function generateTotpSecret(): string {
  return new Secret({ size: 20 }).base32;
}

export function buildTotpUri(email: string, secretBase32: string): string {
  const totp = new TOTP({
    issuer: ISSUER,
    label: email,
    secret: Secret.fromBase32(secretBase32),
    algorithm: "SHA1",
    digits: 6,
    period: 30,
  });
  return totp.toString();
}

export function verifyTotpCode(secretBase32: string, code: string): boolean {
  const normalized = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(normalized)) return false;
  const totp = new TOTP({
    secret: Secret.fromBase32(secretBase32),
    algorithm: "SHA1",
    digits: 6,
    period: 30,
  });
  const delta = totp.validate({ token: normalized, window: 1 });
  return delta !== null;
}

export function encryptTotpSecret(secretBase32: string): string {
  return encryptSecret(secretBase32);
}

export function decryptTotpSecret(stored: string | null | undefined): string | null {
  if (!stored) return null;
  return decryptSecret(stored);
}

export function generateBackupCodes(): { plain: string[]; hashed: string[] } {
  const plain: string[] = [];
  const hashed: string[] = [];
  for (let i = 0; i < BACKUP_CODE_COUNT; i++) {
    const segment = () => randomBytes(2).toString("hex").toUpperCase();
    const code = `${segment()}-${segment()}`;
    plain.push(code);
    hashed.push(hashBackupCode(code.replace(/-/g, "").toLowerCase()));
  }
  return { plain, hashed };
}

export function verifyMfaCode(
  secretBase32: string | null,
  backupHashesJson: string | null,
  code: string
): { ok: boolean; usedBackupIndex?: number } {
  const normalized = code.replace(/\s/g, "").toLowerCase();
  if (secretBase32 && /^\d{6}$/.test(normalized)) {
    if (verifyTotpCode(secretBase32, normalized)) {
      return { ok: true };
    }
  }

  const backupNormalized = normalized.replace(/-/g, "");
  if (backupHashesJson && /^[a-f0-9]{8}$/i.test(backupNormalized)) {
    let hashes: string[] = [];
    try {
      hashes = JSON.parse(backupHashesJson) as string[];
    } catch {
      return { ok: false };
    }
    const index = hashes.findIndex((h) => verifyBackupCode(backupNormalized, h));
    if (index >= 0) {
      return { ok: true, usedBackupIndex: index };
    }
  }

  return { ok: false };
}

export function serializeBackupHashes(hashes: string[]): string {
  return JSON.stringify(hashes);
}

export function removeUsedBackupCode(hashesJson: string, index: number): string {
  const hashes = JSON.parse(hashesJson) as string[];
  hashes.splice(index, 1);
  return serializeBackupHashes(hashes);
}
