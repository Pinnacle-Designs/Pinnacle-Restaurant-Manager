import { NextRequest, NextResponse } from "next/server";
import { addMonths } from "date-fns";
import { prisma } from "@/lib/prisma";
import { getLocationIdFromRequest } from "@/lib/location";
import { requireAuth } from "@/lib/api-auth";
import { resolveStaffMemberForUser } from "@/lib/staff-resolve";

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: RouteParams) {
  const { user, error } = await requireAuth(request);
  if (error) return error;

  const { id: moduleId } = await params;
  const locationId = await getLocationIdFromRequest(request);
  const body = await request.json();

  const staffMember = await resolveStaffMemberForUser(user!, locationId);
  if (!staffMember) {
    return NextResponse.json({ error: "No staff profile linked to your account" }, { status: 403 });
  }

  const module = await prisma.trainingModule.findFirst({
    where: { id: moduleId, locationId, active: true },
  });
  if (!module) {
    return NextResponse.json({ error: "Module not found" }, { status: 404 });
  }

  const signatureName = String(body.signatureName || "").trim();
  if (!signatureName) {
    return NextResponse.json({ error: "Signature name required" }, { status: 400 });
  }

  const expiresAt = module.renewalMonths
    ? addMonths(new Date(), module.renewalMonths)
    : null;

  const completion = await prisma.trainingCompletion.create({
    data: {
      locationId,
      moduleId: module.id,
      staffMemberId: staffMember.id,
      signatureName,
      score: body.score != null ? Number(body.score) : null,
      expiresAt,
    },
  });

  return NextResponse.json({
    id: completion.id,
    completedAt: completion.completedAt.toISOString(),
    expiresAt: completion.expiresAt?.toISOString() ?? null,
    message: "Training recorded. Thank you for completing this module.",
  });
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id: moduleId } = await params;
  const locationId = await getLocationIdFromRequest(request);

  const module = await prisma.trainingModule.findFirst({
    where: { id: moduleId, locationId, active: true },
  });
  if (!module) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({
    id: module.id,
    moduleKey: module.moduleKey,
    title: module.title,
    kind: module.kind,
    summary: module.summary,
    content: module.content,
    estimatedMinutes: module.estimatedMinutes,
    required: module.required,
    renewalMonths: module.renewalMonths,
  });
}
