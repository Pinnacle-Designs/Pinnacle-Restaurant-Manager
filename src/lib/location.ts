import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { getSessionUserFromRequest } from "./auth";
import { isProductionRuntime } from "./env";
import { resolveAuthorizedLocationId } from "./location-access";
import { prisma } from "./prisma";
import { LOCATION_COOKIE_NAME } from "./location-constants";

export { LOCATION_COOKIE_NAME };

async function locationExists(locationId: string): Promise<boolean> {
  const row = await prisma.location.findUnique({
    where: { id: locationId },
    select: { id: true },
  });
  return Boolean(row);
}

export async function getLocationId(): Promise<string> {
  const cookieStore = await cookies();
  const cookieId = cookieStore.get(LOCATION_COOKIE_NAME)?.value;

  if (cookieId && (await locationExists(cookieId))) {
    return cookieId;
  }

  if (isProductionRuntime()) {
    throw new Error("No authorized location in production");
  }

  const defaultLocation = await prisma.location.findFirst({
    where: { active: true },
    orderBy: { createdAt: "asc" },
  });

  if (defaultLocation) return defaultLocation.id;

  const created = await prisma.location.create({
    data: { name: "Main Location", address: "123 Restaurant Row" },
  });
  return created.id;
}

export async function getLocationIdFromRequest(request: Request): Promise<string> {
  const nextRequest = request as NextRequest;
  const cookieId = nextRequest.cookies?.get(LOCATION_COOKIE_NAME)?.value;
  const user = await getSessionUserFromRequest(nextRequest);

  const resolved = await resolveAuthorizedLocationId(nextRequest, user, cookieId);
  if (resolved && (await locationExists(resolved))) {
    return resolved;
  }

  if (user?.locationId && (await locationExists(user.locationId))) {
    return user.locationId;
  }

  if (isProductionRuntime()) {
    throw new Error("No authorized location in production");
  }

  return getLocationId();
}
