import { prisma } from "@/lib/prisma";
import { sendEmail, smtpConfigured } from "@/lib/email/smtp";

export interface VendorCreditEmailInput {
  locationId: string;
  creditId: string;
  to: string;
  vendor: string;
  amount: number;
  reason: string;
  category?: string | null;
  photoUrl?: string | null;
  invoiceNumber?: string | null;
  locationName?: string;
}

function buildCreditEmailBody(input: VendorCreditEmailInput) {
  const lines = [
    `Credit memo request — ${input.locationName ?? "Restaurant"}`,
    "",
    `Vendor: ${input.vendor}`,
    `Requested credit: $${input.amount.toFixed(2)}`,
    `Reason: ${input.reason}`,
  ];
  if (input.category) lines.push(`Category: ${input.category.replace(/_/g, " ")}`);
  if (input.invoiceNumber) lines.push(`Related invoice: ${input.invoiceNumber}`);
  if (input.photoUrl) lines.push(`Damage photo attached in Pinnacle — reference ID ${input.creditId}`);
  lines.push(
    "",
    "Please issue an official credit memo and reply with the memo number.",
    "",
    `Reference ID: ${input.creditId}`
  );
  return lines.join("\n");
}

/** Send credit request to vendor rep via SMTP when configured; otherwise log in activity. */
export async function sendVendorCreditRequestEmail(
  input: VendorCreditEmailInput
): Promise<{ status: "SENT" | "DEMO" | "FAILED"; message: string }> {
  const subject = `Credit memo request — ${input.vendor} — $${input.amount.toFixed(2)}`;
  const body = buildCreditEmailBody(input);

  if (smtpConfigured()) {
    const result = await sendEmail({ to: input.to, subject, body });
    await prisma.activityLog.create({
      data: {
        locationId: input.locationId,
        action: result.ok ? "CREDIT_EMAIL_SENT" : "CREDIT_EMAIL_FAILED",
        entity: "vendor_credit",
        entityId: input.creditId,
        details: `${subject} → ${input.to}: ${result.message}`,
      },
    });
    return {
      status: result.ok ? "SENT" : "FAILED",
      message: result.message,
    };
  }

  await prisma.activityLog.create({
    data: {
      locationId: input.locationId,
      action: "CREDIT_EMAIL_DEMO",
      entity: "vendor_credit",
      entityId: input.creditId,
      details: `Credit request to ${input.to}: ${subject} — ${body.slice(0, 240)}…`,
    },
  });

  return {
    status: "DEMO",
    message: `Credit request queued for ${input.to} (logged in activity — configure SMTP for live email).`,
  };
}
