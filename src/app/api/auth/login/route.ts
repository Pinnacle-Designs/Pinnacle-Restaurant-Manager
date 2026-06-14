import { NextRequest, NextResponse } from "next/server";
import {
  loginUser,
  createSessionToken,
  sessionCookieOptions,
  getSessionUserFromRequest,
} from "@/lib/auth";
import { LOCATION_COOKIE_NAME } from "@/lib/location";
import { setupDemoWorkspace, type DemoMode } from "@/lib/seed-data";
import { applyEmbedAuthCookies } from "@/lib/embed-cookies";
import { isDemoAccountEmail } from "@/lib/demo-users";
import { resolveUserWorkspace } from "@/lib/user-workspace";

export async function GET(request: NextRequest) {
  const user = await getSessionUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ user: null });
  }
  return NextResponse.json({ user });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const email = String(body.email || "").trim();
  const user = await loginUser(email, body.password);

  if (!user) {
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }

  const token = await createSessionToken(user);
  const forEmbed = body.embed === true;
  const demoMode: DemoMode = body.demoMode === "fresh" ? "fresh" : "seeded";
  const useDemoWorkspace = body.demo === true && (body.demoMode === "seeded" || body.demoMode === "fresh");

  if (!useDemoWorkspace && isDemoAccountEmail(email)) {
    return NextResponse.json(
      {
        error:
          "Demo accounts are for the live demo only. Create your own account or use the embedded demo on the marketing site.",
      },
      { status: 403 }
    );
  }

  let workspace = null;
  let workspaceError: string | undefined;

  if (useDemoWorkspace) {
    try {
      workspace = await setupDemoWorkspace(demoMode);
    } catch (err) {
      console.error("Demo workspace setup failed:", err);
      workspaceError = err instanceof Error ? err.message : "Demo setup failed";
    }
  } else {
    try {
      workspace = await resolveUserWorkspace(user);
    } catch (err) {
      console.error("User workspace resolution failed:", err);
      workspaceError = err instanceof Error ? err.message : "Could not open your workspace";
    }
  }

  const response = NextResponse.json({
    user,
    workspace,
    workspaceError,
  });

  const locationId = workspace?.locationId;

  if (forEmbed) {
    if (locationId) {
      applyEmbedAuthCookies(response, request, token, locationId, true);
    } else {
      response.cookies.set(sessionCookieOptions(token, true));
    }
  } else {
    response.cookies.set(sessionCookieOptions(token, false));
    if (locationId) {
      response.cookies.set(LOCATION_COOKIE_NAME, locationId, {
        path: "/",
        maxAge: 60 * 60 * 24 * 365,
        sameSite: "lax",
      });
    }
  }

  return response;
}
