import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getLocationIdFromRequest } from "@/lib/location";
import { requirePermission } from "@/lib/api-auth";

export async function GET(request: NextRequest) {
  const { error } = await requirePermission(request, "manage_retention");
  if (error) return error;

  const locationId = await getLocationIdFromRequest(request);
  const staffMemberId = request.nextUrl.searchParams.get("staffMemberId");
  const limit = Math.min(100, parseInt(request.nextUrl.searchParams.get("limit") || "50", 10));

  const feedback = await prisma.shiftFeedback.findMany({
    where: {
      locationId,
      ...(staffMemberId ? { staffMemberId } : {}),
    },
    include: {
      staffMember: { select: { id: true, name: true, role: true } },
      shift: { select: { id: true, date: true, startTime: true, endTime: true, workRole: true } },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return NextResponse.json({ feedback });
}

export async function POST(request: NextRequest) {
  const { user, error } = await requirePermission(request, "manage_retention");
  if (error) return error;

  const locationId = await getLocationIdFromRequest(request);
  const body = await request.json();

  if (!body.staffMemberId || !body.content?.trim()) {
    return NextResponse.json({ error: "Staff member and feedback content are required." }, { status: 400 });
  }

  const kind = ["NOTE", "SHOUT_OUT", "COACHING"].includes(body.kind) ? body.kind : "NOTE";

  const member = await prisma.staffMember.findFirst({
    where: { id: body.staffMemberId, locationId },
  });
  if (!member) {
    return NextResponse.json({ error: "Staff member not found." }, { status: 404 });
  }

  if (body.shiftId) {
    const shift = await prisma.shift.findFirst({
      where: { id: body.shiftId, locationId, staffMemberId: body.staffMemberId },
    });
    if (!shift) {
      return NextResponse.json({ error: "Shift not found for this employee." }, { status: 404 });
    }
  }

  const entry = await prisma.shiftFeedback.create({
    data: {
      locationId,
      staffMemberId: body.staffMemberId,
      shiftId: body.shiftId || null,
      authorUserId: user!.id,
      authorName: user!.name,
      kind,
      content: body.content.trim(),
    },
    include: {
      staffMember: { select: { id: true, name: true, role: true } },
      shift: { select: { id: true, date: true, startTime: true, endTime: true, workRole: true } },
    },
  });

  return NextResponse.json(entry);
}
