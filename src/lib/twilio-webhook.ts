import { createHmac, timingSafeEqual } from "crypto";

/** Validate Twilio `X-Twilio-Signature` for inbound webhooks. */
export function validateTwilioSignature(
  authToken: string,
  signature: string,
  url: string,
  params: Record<string, string>
): boolean {
  if (!authToken || !signature) return false;

  const data =
    url +
    Object.keys(params)
      .sort()
      .reduce((acc, key) => acc + key + params[key], "");

  const expected = createHmac("sha1", authToken).update(data, "utf8").digest("base64");

  try {
    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function twilioAuthTokenConfigured(): boolean {
  return Boolean(process.env.TWILIO_AUTH_TOKEN?.trim());
}
