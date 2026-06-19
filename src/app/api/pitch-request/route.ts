import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientIp } from "@/lib/client-ip";
import { isRateLimited } from "@/lib/rate-limit";
import { getMarketingFrameAncestors } from "@/lib/embed-config";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const INTEREST_TYPES = new Set(["licensing", "investing", "acquiring", "other"]);

function withMarketingCors(request: NextRequest, response: NextResponse): NextResponse {
  const origin = request.headers.get("origin");
  if (!origin) return response;

  const allowed =
    origin.endsWith(".github.io") ||
    origin.startsWith("http://localhost:") ||
    origin.startsWith("http://127.0.0.1:") ||
    getMarketingFrameAncestors().includes(origin);

  if (!allowed) return response;

  response.headers.set("Access-Control-Allow-Origin", origin);
  response.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  response.headers.set("Access-Control-Allow-Headers", "Content-Type");
  response.headers.append("Vary", "Origin");
  return response;
}

export async function OPTIONS(request: NextRequest) {
  return withMarketingCors(request, new NextResponse(null, { status: 204 }));
}

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  if (await isRateLimited(`pitch-request:ip:${ip}`, 5, 60_000)) {
    return withMarketingCors(
      request,
      NextResponse.json({ error: "Too many requests. Try again shortly." }, { status: 429 })
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return withMarketingCors(request, NextResponse.json({ error: "Invalid request" }, { status: 400 }));
  }

  const name = String(body.name || "").trim().slice(0, 120);
  const email = String(body.email || "").trim().toLowerCase().slice(0, 254);
  const company = String(body.company || "").trim().slice(0, 160);
  const interest = String(body.interest || "").trim().toLowerCase();
  const message = String(body.message || "").trim().slice(0, 2000);

  if (!name || !email || !INTEREST_TYPES.has(interest)) {
    return withMarketingCors(
      request,
      NextResponse.json({ error: "Name, email, and interest type are required" }, { status: 400 })
    );
  }

  if (!EMAIL_RE.test(email)) {
    return withMarketingCors(
      request,
      NextResponse.json({ error: "Enter a valid email address" }, { status: 400 })
    );
  }

  if (await isRateLimited(`pitch-request:email:${email}`, 3, 60 * 60_000)) {
    return withMarketingCors(
      request,
      NextResponse.json({ error: "A request was already submitted recently." }, { status: 429 })
    );
  }

  await prisma.activityLog.create({
    data: {
      locationId: null,
      action: "REQUEST",
      entity: "pitch_deck",
      details: JSON.stringify({
        name,
        email,
        company: company || null,
        interest,
        message: message || null,
        ip,
        userAgent: request.headers.get("user-agent")?.slice(0, 240) ?? null,
      }),
    },
  });

  return withMarketingCors(
    request,
    NextResponse.json({
      message:
        "Thank you. Your request has been received. We review partnership inquiries personally and will follow up if there is a fit.",
    })
  );
}
