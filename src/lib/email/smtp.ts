import nodemailer from "nodemailer";

export interface SendEmailInput {
  to: string;
  subject: string;
  body: string;
  replyTo?: string;
}

export function smtpConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST?.trim() && process.env.SMTP_FROM?.trim());
}

function createTransport() {
  const host = process.env.SMTP_HOST?.trim();
  const from = process.env.SMTP_FROM?.trim();
  if (!host || !from) {
    throw new Error("SMTP_HOST and SMTP_FROM are required");
  }

  const port = Number(process.env.SMTP_PORT || "587");
  const secure = process.env.SMTP_SECURE === "true";
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: user && pass ? { user, pass } : undefined,
  });
}

/** Send email via configured SMTP relay. */
export async function sendEmail(
  input: SendEmailInput
): Promise<{ ok: boolean; message: string }> {
  if (!smtpConfigured()) {
    return { ok: false, message: "SMTP is not configured" };
  }

  try {
    const transport = createTransport();
    const from = process.env.SMTP_FROM!.trim();
    await transport.sendMail({
      from,
      to: input.to,
      replyTo: input.replyTo,
      subject: input.subject,
      text: input.body,
    });
    return { ok: true, message: `Email sent to ${input.to}` };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "SMTP send failed",
    };
  }
}
