import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getLocationIdFromRequest } from "@/lib/location";
import { getSessionUserFromRequest } from "@/lib/auth";
import { requirePermission, stripSalaries, unauthorizedResponse } from "@/lib/api-auth";
import { hashClockPin, isValidClockPin } from "@/lib/timeclock/clock-pin";
import { getRequestPlan } from "@/lib/plan-api";
import { assertCanAddStaffMember } from "@/lib/plan-enforcement";
import {
  assertPinAvailableAtLocation,
  enrichStaffForClient,
  syncStaffAppLoginUser,
} from "@/lib/staff-app-login";

export async function GET(request: NextRequest) {
  const user = await getSessionUserFromRequest(request);
  if (!user) return unauthorizedResponse();

  const locationId = await getLocationIdFromRequest(request);
  const staff = await prisma.staffMember.findMany({
    where: { locationId },
    orderBy: { name: "asc" },
  });
  const safe = stripSalaries(user.role, staff).map(enrichStaffForClient);
  return NextResponse.json(safe);
}

export async function POST(request: NextRequest) {
  const { user, error } = await requirePermission(request, "edit_staff");
  if (error) return error;

  const locationId = await getLocationIdFromRequest(request);
  const body = await request.json();

  const plan = await getRequestPlan(request);
  const seatCheck = await assertCanAddStaffMember(locationId, plan);
  if (!seatCheck.ok) {
    return NextResponse.json({ error: seatCheck.message, limit: seatCheck.limit }, { status: 403 });
  }

  const appLoginEnabled = Boolean(body.appLoginEnabled);
  const pinInput = body.clockPin != null && body.clockPin !== "" ? String(body.clockPin) : "";
  let clockPinHash: string | null = null;

  if (appLoginEnabled) {
    if (pinInput) {
      if (!isValidClockPin(pinInput)) {
        return NextResponse.json({ error: "PIN must be 4–6 digits" }, { status: 400 });
      }
      try {
        await assertPinAvailableAtLocation(locationId, pinInput);
      } catch (err) {
        return NextResponse.json(
          { error: err instanceof Error ? err.message : "PIN unavailable" },
          { status: 400 }
        );
      }
      clockPinHash = hashClockPin(pinInput);
    }
  } else {
    const pin = pinInput || "1234";
    if (!isValidClockPin(pin)) {
      return NextResponse.json({ error: "Clock PIN must be 4–6 digits" }, { status: 400 });
    }
    try {
      await assertPinAvailableAtLocation(locationId, pin);
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "PIN unavailable" },
        { status: 400 }
      );
    }
    clockPinHash = hashClockPin(pin);
  }

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
      clockPinHash,
    },
  });

  if (appLoginEnabled) {
    try {
      await syncStaffAppLoginUser({
        staffMemberId: member.id,
        locationId,
        name: member.name,
        jobRole: member.role,
        appLoginEnabled: true,
        pin: pinInput || null,
        active: member.active,
        existingClockPinHash: clockPinHash,
      });
    } catch (err) {
      await prisma.staffMember.delete({ where: { id: member.id } });
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Could not create app login" },
        { status: 500 }
      );
    }
  }

  const refreshed = await prisma.staffMember.findUniqueOrThrow({ where: { id: member.id } });

  await prisma.activityLog.create({
    data: {
      locationId,
      action: "CREATE",
      entity: "staff",
      entityId: member.id,
      details: `Added staff: ${member.name}${appLoginEnabled ? " (app login)" : ""}`,
    },
  });

  return NextResponse.json(
    enrichStaffForClient(stripSalaries(user!.role, [refreshed])[0])
  );
}
