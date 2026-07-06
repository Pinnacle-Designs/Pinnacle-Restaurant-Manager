import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSecureAuth } from "@/lib/api-auth";
import { isRateLimited } from "@/lib/rate-limit";
import { privateJsonResponse } from "@/lib/secure-response";
import { isStaffPinLoginEmail } from "@/lib/staff-pin-email";
import { assertPinAvailableAtLocation } from "@/lib/staff-app-login";
import { hashClockPin, isValidClockPin, verifyClockPin } from "@/lib/timeclock/clock-pin";

export async function POST(request: NextRequest) {
  const { user, error } = await requireSecureAuth(request);
  if (error) return error;

  if (!isStaffPinLoginEmail(user!.email)) {
    return privateJsonResponse(
      { error: "PIN change is only available for team sign-in accounts" },
      { status: 403 }
    );
  }

  if (await isRateLimited(`pin-change:${user!.id}`, 5, 60_000)) {
    return privateJsonResponse(
      { error: "Too many PIN attempts. Try again shortly." },
      { status: 429 }
    );
  }

  const body = await request.json();
  const currentPin = String(body.currentPin ?? "").trim();
  const newPin = String(body.newPin ?? "").trim();

  if (!currentPin || !newPin) {
    return privateJsonResponse({ error: "Current and new PIN are required" }, { status: 400 });
  }

  if (!isValidClockPin(newPin)) {
    return privateJsonResponse({ error: "New PIN must be 4–6 digits" }, { status: 400 });
  }

  if (currentPin === newPin) {
    return privateJsonResponse({ error: "New PIN must be different from your current PIN" }, { status: 400 });
  }

  const staff = await prisma.staffMember.findFirst({
    where: { userId: user!.id, active: true },
    select: { id: true, locationId: true, clockPinHash: true },
  });

  if (!staff?.clockPinHash) {
    return privateJsonResponse({ error: "No PIN on file — sign out and set one on the team sign-in screen" }, { status: 400 });
  }

  if (!verifyClockPin(currentPin, staff.clockPinHash)) {
    return privateJsonResponse({ error: "Current PIN is incorrect" }, { status: 401 });
  }

  try {
    await assertPinAvailableAtLocation(staff.locationId, newPin, staff.id);
  } catch (err) {
    return privateJsonResponse(
      { error: err instanceof Error ? err.message : "PIN unavailable" },
      { status: 400 }
    );
  }

  const pinHash = hashClockPin(newPin);

  await prisma.$transaction([
    prisma.staffMember.update({
      where: { id: staff.id },
      data: { clockPinHash: pinHash },
    }),
    prisma.user.update({
      where: { id: user!.id },
      data: { passwordHash: pinHash },
    }),
  ]);

  return privateJsonResponse({ message: "PIN updated successfully" });
}
