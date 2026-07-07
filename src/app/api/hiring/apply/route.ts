import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizePhone } from "@/lib/hiring/utils";
import { sendSms } from "@/lib/hiring/sms";
import { isProductionRuntime } from "@/lib/dev-routes";
import { isRateLimited } from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (await isRateLimited(`hiring-apply:${ip}`, 8, 60_000)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const body = await request.json();
  const name = String(body.name || "").trim();
  const phone = normalizePhone(String(body.phone || ""));
  const email = body.email ? String(body.email).trim() : null;
  const applyCode = body.applyCode ? String(body.applyCode).trim().toUpperCase() : null;
  if (!name || phone.length < 11) {
    return NextResponse.json({ error: "Name and valid phone are required" }, { status: 400 });
  }

  let posting = null;
  let resolvedLocationId: string | null = null;

  if (applyCode) {
    posting = await prisma.jobPosting.findFirst({
      where: { applyCode, active: true },
      include: { location: true },
    });
    if (!posting) {
      return NextResponse.json({ error: "Invalid job code" }, { status: 404 });
    }
    resolvedLocationId = posting.locationId;
  }

  if (!resolvedLocationId) {
    return NextResponse.json({ error: "A valid job code is required" }, { status: 400 });
  }

  const applicant = await prisma.applicant.upsert({
    where: { locationId_phone: { locationId: resolvedLocationId, phone } },
    create: { locationId: resolvedLocationId, name, phone, email },
    update: { name, email: email ?? undefined },
  });

  const application = await prisma.application.create({
    data: {
      locationId: resolvedLocationId,
      applicantId: applicant.id,
      jobPostingId: posting?.id,
      role: posting?.role || String(body.role || "Server"),
      source: body.source === "TEXT_APPLY" ? "TEXT_APPLY" : "WEB",
      status: "NEW",
    },
    include: { applicant: true, location: true },
  });

  const confirmBody = `Thanks ${name.split(" ")[0]}! We received your application for ${application.role} at ${application.location.name}. We'll text you about next steps.`;
  await sendSms({
    locationId: resolvedLocationId,
    applicantId: applicant.id,
    toPhone: phone,
    body: confirmBody,
  });

  return NextResponse.json({
    message: "Application received",
    applicationId: application.id,
  });
}

/** Dev helper: list apply codes (disabled in production). */
export async function GET() {
  if (isProductionRuntime()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const postings = await prisma.jobPosting.findMany({
    where: { active: true },
    select: { applyCode: true, title: true, role: true, location: { select: { name: true } } },
    take: 20,
  });
  return NextResponse.json({ postings });
}
