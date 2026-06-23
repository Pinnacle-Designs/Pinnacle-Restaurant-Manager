import { createHmac, timingSafeEqual } from "crypto";
import { getAuthSecret } from "@/lib/env";

const STATE_TTL_MS = 15 * 60 * 1000;

export function createOAuthState(payload: Record<string, string>): string {
  const exp = String(Date.now() + STATE_TTL_MS);
  const body = Buffer.from(JSON.stringify({ ...payload, exp })).toString("base64url");
  const sig = createHmac("sha256", getAuthSecret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function parseOAuthState<T extends Record<string, string>>(
  state: string
): T | null {
  try {
    const [body, sig] = state.split(".");
    if (!body || !sig) return null;
    const expected = createHmac("sha256", getAuthSecret()).update(body).digest("base64url");
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    const data = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as T & {
      exp: string;
    };
    if (Number(data.exp) < Date.now()) return null;
    return data;
  } catch {
    return null;
  }
}
