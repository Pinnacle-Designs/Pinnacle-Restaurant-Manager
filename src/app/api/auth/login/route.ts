import { NextRequest } from "next/server";
import {
  loginUser,
  getSessionUserFromRequest,
} from "@/lib/auth";
import { prepareAuthSession, attachAuthCookies } from "@/lib/auth-cookies";
import { setupDemoWorkspace, type DemoMode } from "@/lib/seed-data";
import { isDemoAccountEmail, isPlanDemoAccountEmail, planDemoLoginEnabled, devDemoLoginEnabled } from "@/lib/demo-users";
import { completeUserLogin } from "@/lib/complete-login";
import { prisma } from "@/lib/prisma";
import { getClientIp } from "@/lib/client-ip";
import { isRateLimited } from "@/lib/rate-limit";
import { privateJsonResponse } from "@/lib/secure-response";
import { createMfaPendingToken } from "@/lib/mfa-pending";
import { requireActiveAccount } from "@/lib/api-auth";
import { isCrossOriginEmbedRequest } from "@/lib/embed-launch";
import { isProCleanAccountEmail } from "@/lib/pro-clean-email";
import { completeProCleanLogin } from "@/lib/pro-clean-login";

const LOGIN_FAILURE_DELAY_MS = 250;

async function rejectLogin() {
  await new Promise((resolve) => setTimeout(resolve, LOGIN_FAILURE_DELAY_MS));
  return privateJsonResponse({ error: "Invalid email or password" }, { status: 401 });
}

export async function GET(request: NextRequest) {
  const user = await getSessionUserFromRequest(request);
  if (!user) {
    return privateJsonResponse({ user: null });
  }
  const { user: activeUser, error } = await requireActiveAccount(user);
  if (error || !activeUser) {
    return privateJsonResponse({ user: null });
  }

  if (isProCleanAccountEmail(activeUser.email)) {
    return completeProCleanLogin({
      request,
      user: activeUser,
      email: activeUser.email,
      forEmbed: isCrossOriginEmbedRequest(request),
    });
  }

  const prepared = await prepareAuthSession(activeUser);
  const response = privateJsonResponse({ user: prepared.sessionUser });
  const forEmbed = isCrossOriginEmbedRequest(request);
  attachAuthCookies(response, prepared, forEmbed ? { forEmbed: true, secure: true } : undefined);
  return response;
}

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  if (await isRateLimited(`login:ip:${ip}`, 20, 60_000)) {
    return privateJsonResponse(
      { error: "Too many login attempts. Try again shortly." },
      { status: 429 }
    );
  }

  const body = await request.json();
  const email = String(body.email || "").trim().toLowerCase();

  if (email && (await isRateLimited(`login:email:${email}`, 10, 60_000))) {
    return privateJsonResponse(
      { error: "Too many login attempts. Try again shortly." },
      { status: 429 }
    );
  }

  const user = await loginUser(email, body.password);

  if (!user) {
    return rejectLogin();
  }

  if (isProCleanAccountEmail(email)) {
    return completeProCleanLogin({
      request,
      user,
      email,
      forEmbed: body.embed === true,
    });
  }

  const forEmbed = body.embed === true;
  const demoMode: DemoMode = body.demoMode === "fresh" ? "fresh" : "seeded";
  const useDemoWorkspace = body.demo === true && (body.demoMode === "seeded" || body.demoMode === "fresh");

  if (
    !useDemoWorkspace &&
    isDemoAccountEmail(email) &&
    !devDemoLoginEnabled()
  ) {
    return privateJsonResponse(
      {
        error:
          "Demo accounts are for the live demo only. Create your own account or use the embedded demo on the marketing site.",
      },
      { status: 403 }
    );
  }

  if (!useDemoWorkspace && isPlanDemoAccountEmail(email) && !planDemoLoginEnabled()) {
    return rejectLogin();
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { mfaEnabled: true },
  });

  if (dbUser?.mfaEnabled && !useDemoWorkspace) {
    const pendingToken = await createMfaPendingToken(user.id);
    return privateJsonResponse({
      mfaRequired: true,
      pendingToken,
      email: user.email,
    });
  }

  if (useDemoWorkspace) {
    try {
      if (demoMode === "seeded" && isDemoAccountEmail(email)) {
        const { resolveOwnerDemoLocationId, ensureFullDemoWorkspace } = await import(
          "@/lib/demo-location"
        );
        const locationId = await resolveOwnerDemoLocationId(user.id, user.locationId);
        await prisma.user.update({
          where: { id: user.id },
          data: { locationId },
        });
        user.locationId = locationId;
        void ensureFullDemoWorkspace(locationId, user.id).catch((err) => {
          console.error("Demo background seed failed:", err);
        });
      } else {
        const workspace = await setupDemoWorkspace(demoMode);
        await prisma.user.update({
          where: { id: user.id },
          data: { locationId: workspace.locationId },
        });
        user.locationId = workspace.locationId;
      }
    } catch (err) {
      console.error("Demo workspace setup failed:", err);
      return privateJsonResponse(
        { error: err instanceof Error ? err.message : "Demo setup failed" },
        { status: 500 }
      );
    }
  }

  return completeUserLogin({ request, user, email, forEmbed });
}
