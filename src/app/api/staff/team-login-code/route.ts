import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getLocationIdFromRequest } from "@/lib/location";
import { requirePermission } from "@/lib/api-auth";
import { privateJsonResponse } from "@/lib/secure-response";
import {
  ensureLocationTeamLoginCode,
  generateTeamLoginCode,
  isValidTeamLoginCode,
} from "@/lib/staff-app-login";

export async function GET(request: NextRequest) {
  const { user, error } = await requirePermission(request, "edit_staff");
  if (error) return error;

  const locationId = await getLocationIdFromRequest(request);
  const location = await prisma.location.findUnique({
    where: { id: locationId },
    select: { name: true, teamLoginCode: true },
  });
  if (!location) {
    return privateJsonResponse({ error: "Location not found" }, { status: 404 });
  }

  const teamLoginCode =
    location.teamLoginCode ?? (await ensureLocationTeamLoginCode(locationId));

  return privateJsonResponse({
    locationName: location.name,
    teamLoginCode,
    canEdit: user!.role === "OWNER",
  });
}

export async function PATCH(request: NextRequest) {
  const { user, error } = await requirePermission(request, "edit_staff");
  if (error) return error;

  if (user!.role !== "OWNER") {
    return privateJsonResponse({ error: "Only owners can change the team login code" }, { status: 403 });
  }

  const locationId = await getLocationIdFromRequest(request);
  const body = await request.json();

  if (body.regenerate === true) {
    for (let attempt = 0; attempt < 8; attempt++) {
      const code = generateTeamLoginCode();
      try {
        const updated = await prisma.location.update({
          where: { id: locationId },
          data: { teamLoginCode: code },
          select: { name: true, teamLoginCode: true },
        });
        return privateJsonResponse({
          locationName: updated.name,
          teamLoginCode: updated.teamLoginCode,
        });
      } catch {
        // Unique collision
      }
    }
    return privateJsonResponse({ error: "Could not generate a new code" }, { status: 500 });
  }

  const code = body.teamLoginCode != null ? String(body.teamLoginCode).trim() : "";
  if (!isValidTeamLoginCode(code)) {
    return privateJsonResponse({ error: "Team login code must be 4–6 digits" }, { status: 400 });
  }

  try {
    const updated = await prisma.location.update({
      where: { id: locationId },
      data: { teamLoginCode: code },
      select: { name: true, teamLoginCode: true },
    });
    return privateJsonResponse({
      locationName: updated.name,
      teamLoginCode: updated.teamLoginCode,
    });
  } catch {
    return privateJsonResponse({ error: "That code is already in use" }, { status: 400 });
  }
}
