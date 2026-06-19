import nodemailer from "nodemailer";
import { appBaseUrl } from "./payments/providers";

function smtpConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST?.trim() && process.env.SMTP_FROM?.trim());
}

function createTransport() {
  const host = process.env.SMTP_HOST!.trim();
  const port = Number(process.env.SMTP_PORT || "587");
  const secure = process.env.SMTP_SECURE === "true" || port === 465;
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: user && pass ? { user, pass } : undefined,
  });
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

  await createTransport().sendMail({
    from: process.env.SMTP_FROM!.trim(),
    to: options.to,
    subject: options.subject,
    text: options.text,
    html: options.html ?? options.text.replace(/\n/g, "<br>"),
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
