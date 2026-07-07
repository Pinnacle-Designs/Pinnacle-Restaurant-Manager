import { cookies, headers } from "next/headers";
import type { NextRequest } from "next/server";
import { getSessionUserFromRequest } from "./auth";
import { isDemoAccountEmail, isPlanDemoAccountEmail } from "./demo-email";
import { findSeededDemoLocationId } from "./demo-location";
import { EMBED_LOCATION_HEADER } from "./embed-constants";
import { isProductionRuntime } from "./env";
import { canUserAccessLocation, resolveAuthorizedLocationId } from "./location-access";
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

async function resolveDemoEmbedLocationId(
  email: string,
  sessionLocationId: string | null | undefined
): Promise<string | null> {
  if (isPlanDemoAccountEmail(email)) {
    if (sessionLocationId && (await locationExists(sessionLocationId))) {
      return sessionLocationId;
    }
    return null;
  }

  if (isDemoAccountEmail(email)) {
    return findSeededDemoLocationId();
  }

  return null;
}

export async function getLocationId(): Promise<string> {
  const { getSessionUser } = await import("./auth");
  const user = await getSessionUser();

  if (user && isDemoAccountEmail(user.email)) {
    const demoId = await resolveDemoEmbedLocationId(user.email, user.locationId);
    if (demoId) return demoId;
  }

  const cookieStore = await cookies();
  const cookieId = cookieStore.get(LOCATION_COOKIE_NAME)?.value;

  if (user) {
    if (
      cookieId &&
      (await locationExists(cookieId)) &&
      canUserAccessLocation(user, cookieId)
    ) {
      return cookieId;
    }
    if (user.locationId && (await locationExists(user.locationId))) {
      return user.locationId;
    }
  } else if (cookieId && (await locationExists(cookieId))) {
    return cookieId;
  }

  const hdrs = await headers();
  const headerLocationId = hdrs.get(EMBED_LOCATION_HEADER);
  if (headerLocationId && (await locationExists(headerLocationId))) {
    if (!user || canUserAccessLocation(user, headerLocationId)) {
      return headerLocationId;
    }
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
  const user = await getSessionUserFromRequest(nextRequest);

  if (user && isDemoAccountEmail(user.email)) {
    const demoId = await resolveDemoEmbedLocationId(user.email, user.locationId);
    if (demoId) return demoId;
  }

  const cookieId = nextRequest.cookies?.get(LOCATION_COOKIE_NAME)?.value;

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
