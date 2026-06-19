import nodemailer from "nodemailer";
import { appBaseUrl } from "./payments/providers";

function smtpConfigured(): boolean {
  return Boolean(
    process.env.SMTP_HOST?.trim() &&
      process.env.SMTP_FROM?.trim() &&
      process.env.SMTP_USER?.trim() &&
      process.env.SMTP_PASS?.trim()
  );
}

function createTransport() {
  const host = process.env.SMTP_HOST!.trim();
  const port = Number(process.env.SMTP_PORT || "587");
  const secure = process.env.SMTP_SECURE === "true" || port === 465;
  const user = process.env.SMTP_USER!.trim();
  const pass = process.env.SMTP_PASS!.trim();

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
  });
}

/** Lines for the footer — override with SMTP_EMAIL_SIGNATURE (use | between lines). */
function signatureLines(): string[] {
  const custom = process.env.SMTP_EMAIL_SIGNATURE?.trim();
  if (custom) {
    return custom
      .split(/\||\\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  }
  return [
    "David",
    "Pinnacle Designs LLC",
    "david@pinnacle-designs.com",
    appBaseUrl(),
  ];
}

function appendSignature(body: string): { text: string; html: string } {
  const lines = signatureLines();
  const textSig = ["", "--", ...lines].join("\n");
  const htmlSig = [
    "<br><br>",
    '<table cellpadding="0" cellspacing="0" style="font-family:Arial,sans-serif;font-size:14px;color:#334155;line-height:1.5;">',
    ...lines.map(
      (line, i) =>
        `<tr><td style="padding:0;${
          i === 0 ? "font-weight:600;color:#0f172a;" : ""
        }${i === 1 ? "color:#ea580c;" : ""}">${escapeHtml(line)}</td></tr>`
    ),
    "</table>",
  ].join("");

  const text = `${body}${textSig}`;
  const htmlBody = body
    .split(/\n\n+/)
    .map((p) => `<p style="margin:0 0 12px;font-family:Arial,sans-serif;font-size:15px;color:#334155;">${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
    .join("");

  return {
    text,
    html: `<div style="font-family:Arial,sans-serif;">${htmlBody}${htmlSig}</div>`,
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function sendEmail(options: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}): Promise<{ sent: boolean; devLink?: string }> {
  if (!smtpConfigured()) {
    if (process.env.NODE_ENV !== "production") {
      console.info(`[email] SMTP not configured — would send to ${options.to}: ${options.subject}`);
      const linkMatch = options.text.match(/https?:\/\/\S+/);
      return { sent: false, devLink: linkMatch?.[0] };
    }
    console.warn("[email] SMTP not configured; skipping send to", options.to);
    return { sent: false };
  }

  const signed = appendSignature(options.text);

  await createTransport().sendMail({
    from: process.env.SMTP_FROM!.trim(),
    to: options.to,
    subject: options.subject,
    text: signed.text,
    html: options.html ?? signed.html,
  });

  return { sent: true };
}

export async function sendVerificationEmail(email: string, token: string) {
  const url = `${appBaseUrl()}/verify-email?token=${encodeURIComponent(token)}`;
  return sendEmail({
    to: email,
    subject: "Verify your Pinnacle account",
    text: `Welcome to Pinnacle Restaurant Manager.\n\nVerify your email address:\n${url}\n\nThis link expires in 24 hours.`,
  });
}

export async function sendPasswordResetEmail(email: string, token: string) {
  const url = `${appBaseUrl()}/reset-password?token=${encodeURIComponent(token)}`;
  return sendEmail({
    to: email,
    subject: "Reset your Pinnacle password",
    text: `We received a request to reset your password.\n\nReset it here:\n${url}\n\nThis link expires in one hour. If you did not request this, ignore this email.`,
  });
}
