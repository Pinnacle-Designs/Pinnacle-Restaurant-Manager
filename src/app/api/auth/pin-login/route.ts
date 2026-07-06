import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { completeUserLogin } from "@/lib/complete-login";
import { getClientIp } from "@/lib/client-ip";
import { isRateLimited } from "@/lib/rate-limit";
import { privateJsonResponse } from "@/lib/secure-response";
import { staffPinLoginEmail } from "@/lib/staff-pin-email";
import {
  assertPinAvailableAtLocation,
  isValidTeamLoginCode,
} from "@/lib/staff-app-login";
import { hashClockPin, isValidClockPin, verifyClockPin } from "@/lib/timeclock/clock-pin";
import type { SessionUser } from "@/lib/session";

const FAILURE_DELAY_MS = 250;

async function rejectPinLogin() {
  await new Promise((resolve) => setTimeout(resolve, FAILURE_DELAY_MS));
  return privateJsonResponse({ error: "Invalid team member or PIN" }, { status: 401 });
}

async function resolveTeamContext(code: string, staffMemberId: string) {
  const location = await prisma.location.findFirst({
    where: { teamLoginCode: code, active: true },
    select: { id: true, name: true },
  });
  if (!location) return null;

  const staff = await prisma.staffMember.findFirst({
    where: {
      id: staffMemberId,
      locationId: location.id,
      active: true,
      userId: { not: null },
    },
    select: {
      id: true,
      name: true,
      role: true,
      userId: true,
      clockPinHash: true,
    },
  });
  if (!staff?.userId) return null;

  const user = await prisma.user.findUnique({
    where: { id: staff.userId },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      locationId: true,
      active: true,
    },
  });
  if (!user?.active) return null;

  return { location, staff, user };
}

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  if (await isRateLimited(`pin-login:ip:${ip}`, 20, 60_000)) {
    return privateJsonResponse({ error: "Too many login attempts. Try again shortly." }, { status: 429 });
  }

  const body = await request.json();
  const code = String(body.code ?? "").trim();
  const staffMemberId = String(body.staffMemberId ?? "").trim();
  const pin = String(body.pin ?? "").trim();
  const setup = body.setup === true;

  if (!isValidTeamLoginCode(code) || !staffMemberId) {
    return privateJsonResponse({ error: "Restaurant code and team member are required" }, { status: 400 });
  }

  if (!isValidClockPin(pin)) {
    return privateJsonResponse({ error: "PIN must be 4–6 digits" }, { status: 400 });
  }

  const context = await resolveTeamContext(code, staffMemberId);
  if (!context) {
    return rejectPinLogin();
  }

  if (setup) {
    if (context.staff.clockPinHash) {
      return privateJsonResponse({ error: "PIN already set — sign in with your PIN" }, { status: 400 });
    }

    try {
      await assertPinAvailableAtLocation(context.location.id, pin, context.staff.id);
    } catch (err) {
      return privateJsonResponse(
        { error: err instanceof Error ? err.message : "PIN unavailable" },
        { status: 400 }
      );
    }

    const pinHash = hashClockPin(pin);
    await prisma.staffMember.update({
      where: { id: context.staff.id },
      data: { clockPinHash: pinHash },
    });
    await prisma.user.update({
      where: { id: context.user.id },
      data: { passwordHash: pinHash },
    });
  } else {
    if (!context.staff.clockPinHash) {
      return privateJsonResponse({ needsPinSetup: true }, { status: 400 });
    }
    if (!verifyClockPin(pin, context.staff.clockPinHash)) {
      return rejectPinLogin();
    }
  }

  const sessionUser: SessionUser = {
    id: context.user.id,
    email: context.user.email,
    name: context.user.name,
    role: context.user.role,
    locationId: context.location.id,
  };

  return completeUserLogin({
    request,
    user: sessionUser,
    email: staffPinLoginEmail(context.location.id, context.staff.id),
  });
}
