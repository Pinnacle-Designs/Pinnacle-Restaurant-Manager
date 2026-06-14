import { NextRequest, NextResponse } from "next/server";
import { createSessionToken, hashPassword, sessionCookieOptions } from "@/lib/auth";
import { LOCATION_COOKIE_NAME } from "@/lib/location";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const name = String(body.name || "").trim();
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  const restaurantName = String(body.restaurantName || "").trim() || `${name}'s Restaurant`;

  if (!name || !email || !password) {
    return NextResponse.json({ error: "Name, email, and password are required" }, { status: 400 });
  }

  if (password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json({ error: "An account with this email already exists" }, { status: 409 });
  }

  const location = await prisma.location.create({
    data: {
      name: restaurantName,
      address: "Add your address",
    },
  });

  const user = await prisma.user.create({
    data: {
      email,
      name,
      passwordHash: hashPassword(password),
      role: "OWNER",
      locationId: location.id,
      active: true,
    },
  });

  const sessionUser = {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    locationId: user.locationId,
  };

  const token = await createSessionToken(sessionUser);
  const response = NextResponse.json({
    user: sessionUser,
    workspace: {
      locationId: location.id,
      locationName: location.name,
    },
  });

  response.cookies.set(sessionCookieOptions(token, false));
  response.cookies.set(LOCATION_COOKIE_NAME, location.id, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });

  return response;
}
