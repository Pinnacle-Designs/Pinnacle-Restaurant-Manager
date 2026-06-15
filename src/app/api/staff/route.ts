import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getLocationIdFromRequest } from "@/lib/location";
import { getSessionUserFromRequest } from "@/lib/auth";
import { requirePermission, stripSalaries, unauthorizedResponse } from "@/lib/api-auth";

export async function GET(request: NextRequest) {
  const user = await getSessionUserFromRequest(request);
  if (!user) return unauthorizedResponse();

  const locationId = await getLocationIdFromRequest(request);
  const staff = await prisma.staffMember.findMany({
    where: { locationId },
    orderBy: { name: "asc" },
  });
  return NextResponse.json(stripSalaries(user.role, staff));
}

export async function POST(request: NextRequest) {
  const { user, error } = await requirePermission(request, "edit_staff");
  if (error) return error;

  const locationId = await getLocationIdFromRequest(request);
  const body = await request.json();
  const member = await prisma.staffMember.create({
    data: {
      locationId,
      name: body.name,
      role: body.role,
      email: body.email,
      phone: body.phone,
      hourlyRate: body.hourlyRate ?? 0,
      isTippedEmployee: body.isTippedEmployee ?? false,
      tipPoints: body.tipPoints ?? 1,
      active: body.active ?? true,
      imageUrl: body.imageUrl,
      dateOfBirth: body.dateOfBirth ? new Date(body.dateOfBirth) : null,
      hireDate: body.hireDate ? new Date(body.hireDate) : new Date(),
    },
  });

  await prisma.activityLog.create({
    data: {
      locationId,
      action: "CREATE",
      entity: "staff",
      entityId: member.id,
      details: `Added staff: ${member.name}`,
    },
  });

  return NextResponse.json(stripSalaries(user!.role, [member])[0]);
}
