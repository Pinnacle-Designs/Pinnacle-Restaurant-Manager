import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizePhone } from "@/lib/hiring/utils";
import { sendSms } from "@/lib/hiring/sms";
import {
  twilioAuthTokenConfigured,
  validateTwilioSignature,
} from "@/lib/twilio-webhook";

/** Twilio inbound SMS webhook — text-to-apply and replies. */
export async function POST(request: NextRequest) {
  let from = "";
  let to = "";
  let body = "";
  let formParams: Record<string, string> = {};

  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("application/x-www-form-urlencoded")) {
    const form = await request.formData();
    formParams = Object.fromEntries(
      [...form.entries()].map(([key, value]) => [key, String(value)])
    );
    from = formParams.From || "";
    to = formParams.To || "";
    body = (formParams.Body || "").trim();
  } else {
    const json = (await request.json()) as Record<string, unknown>;
    from = String(json.From || json.from || "");
    to = String(json.To || json.to || "");
    body = String(json.Body || json.body || "").trim();
    for (const [key, value] of Object.entries(json)) {
      if (typeof value === "string") formParams[key] = value;
    }
  }

  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim() || "";
  if (twilioAuthTokenConfigured()) {
    const signature = request.headers.get("x-twilio-signature") || "";
    const url = request.nextUrl.origin + request.nextUrl.pathname;
    if (!validateTwilioSignature(authToken, signature, url, formParams)) {
      return NextResponse.json({ error: "Invalid Twilio signature" }, { status: 403 });
    }
  } else if (process.env.NODE_ENV === "production") {
    console.warn("[twilio] TWILIO_AUTH_TOKEN not set — rejecting webhook in production");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 503 });
  }

  if (!from || !body) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const fromPhone = normalizePhone(from);
  const settings = await prisma.hiringSettings.findFirst({
    where: { OR: [{ applyPhone: to }, { applyPhone: normalizePhone(to) }] },
    include: { location: true },
  });

  if (!settings) {
    const fallback = await prisma.hiringSettings.findFirst({
      include: { location: true },
    });
    if (!fallback) {
      return twimlResponse("Thanks for your message. Hiring is not configured yet.");
    }
  }

  const hiring = settings ?? (await prisma.hiringSettings.findFirst({ include: { location: true } }))!;
  const locationId = hiring.locationId;
  const keyword = hiring.applyKeyword.toUpperCase();
  const upper = body.toUpperCase();

  await prisma.smsMessage.create({
    data: {
      locationId,
      direction: "INBOUND",
      toPhone: normalizePhone(to || hiring.applyPhone || ""),
      fromPhone,
      body,
      status: "received",
    },
  });

  if (upper.startsWith(keyword) || upper === "APPLY") {
    const parts = body.split(/\s+/);
    const name = parts.length > 1 ? parts.slice(1).join(" ") : "Applicant";
    const applyCode = parts.length > 2 && parts[1].length <= 8 ? parts[1].toUpperCase() : null;

    let posting = null;
    if (applyCode) {
      posting = await prisma.jobPosting.findFirst({
        where: { locationId, applyCode, active: true },
      });
    }

    const applicant = await prisma.applicant.upsert({
      where: { locationId_phone: { locationId, phone: fromPhone } },
      create: { locationId, name, phone: fromPhone },
      update: { name },
    });

    await prisma.application.create({
      data: {
        locationId,
        applicantId: applicant.id,
        jobPostingId: posting?.id,
        role: posting?.role || "Server",
        source: "TEXT_APPLY",
        status: "NEW",
      },
    });

    await sendSms({
      locationId,
      applicantId: applicant.id,
      toPhone: fromPhone,
      body: `Got it, ${name.split(" ")[0]}! Application received for ${posting?.role || "our team"} at ${hiring.location.name}. We'll text you to schedule an interview.`,
    });

    return twimlResponse("");
  }

  if (upper === "YES" || upper.includes("CONFIRM")) {
    return twimlResponse("Great — see you at your interview! Reply RESCHEDULE if you need a new time.");
  }

  if (upper.includes("RESCHEDULE")) {
    return twimlResponse("No problem. A manager will text you new interview times shortly.");
  }

  return twimlResponse("Reply APPLY to start an application, or YES to confirm your interview.");
}

function twimlResponse(message: string) {
  const xml = message
    ? `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escapeXml(message)}</Message></Response>`
    : `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`;
  return new NextResponse(xml, { headers: { "Content-Type": "text/xml" } });
}

function escapeXml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
