import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getLocationId } from "@/lib/location";
import { ensureDefaultStorageZones } from "@/lib/walk-in/storage-zones";
import { requireSecureAuth } from "@/lib/api-auth";
import { isProCleanAccountEmail } from "@/lib/pro-clean-email";
import { privateJsonResponse } from "@/lib/secure-response";

export async function GET(request: NextRequest) {
  const { user, error } = await requireSecureAuth(request);
  if (error) return error;

  const currentId = await getLocationId();

  if (isProCleanAccountEmail(user!.email)) {
    const locationId = await getLocationId();
    const location = await prisma.location.findFirst({
      where: { id: locationId, active: true },
    });
    return NextResponse.json({
      locations: location ? [location] : [],
      currentId: locationId,
    });
  }

  const locations = await prisma.location.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
  });
  return NextResponse.json({ locations, currentId });
}

export async function POST(request: NextRequest) {
  const { user, error } = await requireSecureAuth(request);
  if (error) return error;

  if (isProCleanAccountEmail(user!.email)) {
    return privateJsonResponse(
      { error: "Additional locations are not available on the Pro clean workspace." },
      { status: 403 }
    );
  }

  const body = await request.json();
  const location = await prisma.location.create({
    data: {
      name: body.name,
      address: body.address || null,
      phone: body.phone || null,
    },
  });
  await ensureDefaultStorageZones(location.id);
  return NextResponse.json(location);
}
