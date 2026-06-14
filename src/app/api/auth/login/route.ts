import { NextRequest, NextResponse } from "next/server";
import {
  loginUser,
  createSessionToken,
  sessionCookieOptions,
  getSessionUserFromRequest,
} from "@/lib/auth";
import { LOCATION_COOKIE_NAME } from "@/lib/location";
import { setupDemoWorkspace, type DemoMode } from "@/lib/seed-data";

export async function GET(request: NextRequest) {
  const user = await getSessionUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ user: null });
  }
  return NextResponse.json({ user });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const user = await loginUser(body.email, body.password);

  if (!user) {
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }

  const token = await createSessionToken(user);
  const demoMode: DemoMode = body.demoMode === "fresh" ? "fresh" : "seeded";
  const useDemoWorkspace = body.demoMode === "seeded" || body.demoMode === "fresh";
  const forEmbed = body.embed === true;

  let workspace = null;
  let workspaceError: string | undefined;

  if (useDemoWorkspace) {
    try {
      workspace = await setupDemoWorkspace(demoMode);
    } catch (err) {
      console.error("Demo workspace setup failed:", err);
      workspaceError =
        err instanceof Error ? err.message : "Demo setup failed";
    }
  }

  const response = NextResponse.json({
    user,
    workspace,
    workspaceError,
  });
  response.cookies.set(sessionCookieOptions(token, forEmbed));

  if (workspace) {
    response.cookies.set(LOCATION_COOKIE_NAME, workspace.locationId, {
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      sameSite: forEmbed ? "none" : "lax",
      secure: process.env.NODE_ENV === "production" || forEmbed,
    });
  }

  return response;
}
