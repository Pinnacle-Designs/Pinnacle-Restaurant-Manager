import { NextRequest } from "next/server";
import { requireSecureAuth } from "@/lib/api-auth";
import { getPaymentSupportSnapshot } from "@/lib/payments/support";
import { privateJsonResponse } from "@/lib/secure-response";

export async function GET(request: NextRequest) {
  const { user, error } = await requireSecureAuth(request);
  if (error) return error;

  const snapshot = await getPaymentSupportSnapshot(user!.locationId);
  return privateJsonResponse({
    ...snapshot,
    canManage: user!.role === "OWNER",
  });
}
