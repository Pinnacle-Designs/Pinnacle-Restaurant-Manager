import { attachLogoutCookies } from "@/lib/complete-login";
import { privateJsonResponse } from "@/lib/secure-response";

export async function POST() {
  const response = privateJsonResponse({ success: true });
  attachLogoutCookies(response);
  return response;
}
