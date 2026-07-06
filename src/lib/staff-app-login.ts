import { randomBytes } from "crypto";
import type { AppRole } from "./app-role";
import { hashPassword } from "./auth";
import { prisma } from "./prisma";
import { staffPinLoginEmail } from "./staff-pin-email";
import { hashClockPin, isValidClockPin, verifyClockPin } from "./timeclock/clock-pin";

export function jobRoleToAppRole(jobRole: string): AppRole {
  const role = jobRole.trim().toLowerCase();
  if (role === "manager" || role === "trainer") return "MANAGER";
  if (role.includes("chef") || role === "dishwasher") return "KITCHEN";
  if (role === "host" || role === "busser") return "HOST";
  return "SERVER";
}

export function isValidTeamLoginCode(code: string): boolean {
  return /^\d{4,6}$/.test(code);
}

export function generateTeamLoginCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export async function assertPinAvailableAtLocation(
  locationId: string,
  pin: string,
  excludeStaffId?: string
): Promise<void> {
  const members = await prisma.staffMember.findMany({
    where: {
      locationId,
      active: true,
      clockPinHash: { not: null },
      ...(excludeStaffId ? { id: { not: excludeStaffId } } : {}),
    },
    select: { clockPinHash: true },
  });

  for (const member of members) {
    if (member.clockPinHash && verifyClockPin(pin, member.clockPinHash)) {
      throw new Error("This PIN is already used by another team member at your restaurant");
    }
  }
}

export async function ensureLocationTeamLoginCode(locationId: string): Promise<string> {
  const location = await prisma.location.findUnique({
    where: { id: locationId },
    select: { teamLoginCode: true },
  });
  if (!location) throw new Error("Location not found");
  if (location.teamLoginCode) return location.teamLoginCode;

  for (let attempt = 0; attempt < 8; attempt++) {
    const code = generateTeamLoginCode();
    try {
      const updated = await prisma.location.update({
        where: { id: locationId },
        data: { teamLoginCode: code },
        select: { teamLoginCode: true },
      });
      if (updated.teamLoginCode) return updated.teamLoginCode;
    } catch {
      // Unique collision — retry
    }
  }

  throw new Error("Could not generate a team login code");
}

async function deactivateStaffAppUser(userId: string | null | undefined): Promise<void> {
  if (!userId) return;
  await prisma.user.update({
    where: { id: userId },
    data: { active: false },
  });
}

export async function syncStaffAppLoginUser(params: {
  staffMemberId: string;
  locationId: string;
  name: string;
  jobRole: string;
  appLoginEnabled: boolean;
  pin?: string | null;
  active: boolean;
  existingUserId?: string | null;
  existingClockPinHash?: string | null;
}): Promise<void> {
  const userId = params.existingUserId ?? null;

  if (!params.appLoginEnabled || !params.active) {
    await deactivateStaffAppUser(userId);
    return;
  }

  const email = staffPinLoginEmail(params.locationId, params.staffMemberId);
  const appRole = jobRoleToAppRole(params.jobRole);
  const pin = params.pin?.trim();
  const pinHash =
    pin && isValidClockPin(pin)
      ? hashClockPin(pin)
      : params.existingClockPinHash ?? undefined;

  if (userId) {
    await prisma.user.update({
      where: { id: userId },
      data: {
        name: params.name,
        role: appRole,
        locationId: params.locationId,
        active: true,
        emailVerifiedAt: new Date(),
        ...(pinHash ? { passwordHash: pinHash } : {}),
      },
    });
    return;
  }

  const passwordHash = pinHash ?? hashPassword(randomBytes(32).toString("hex"));

  const user = await prisma.user.create({
    data: {
      email,
      name: params.name,
      role: appRole,
      locationId: params.locationId,
      passwordHash,
      active: true,
      emailVerifiedAt: new Date(),
    },
  });

  await prisma.staffMember.update({
    where: { id: params.staffMemberId },
    data: { userId: user.id },
  });
}

export function enrichStaffForClient<T extends { userId?: string | null }>(
  member: T
): T & { hasAppLogin: boolean } {
  return { ...member, hasAppLogin: Boolean(member.userId) };
}
