import { prisma } from "@/lib/prisma";

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

/** Queues credit request to vendor rep (logged in activity; configure SMTP for live delivery). */
export async function sendVendorCreditRequestEmail(
  input: VendorCreditEmailInput
): Promise<{ status: "SENT" | "DEMO" | "FAILED"; message: string }> {
  const subject = `Credit memo request — ${input.vendor} — $${input.amount.toFixed(2)}`;
  const body = buildCreditEmailBody(input);

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
    message: `Credit request queued for ${input.to} (logged in activity — wire SMTP for live email).`,
  };
}
