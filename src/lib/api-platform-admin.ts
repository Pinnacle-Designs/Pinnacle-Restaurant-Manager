import { NextRequest } from "next/server";
import { requireSecureAuth } from "./api-auth";
import { isPlatformAdmin } from "./platform-admin";
import { privateJsonResponse } from "./secure-response";

export async function requirePlatformAdmin(request: NextRequest) {
  const { user, error } = await requireSecureAuth(request);
  if (error) return { user: null, error };

  if (!isPlatformAdmin(user!)) {
    return {
      user: null,
      error: privateJsonResponse({ error: "Forbidden" }, { status: 403 }),
    };
  }

  return { user: user!, error: null };
}
