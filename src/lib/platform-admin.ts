import type { SessionUser } from "./session";

export function platformAdminEmails(): string[] {
  return (process.env.PLATFORM_ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isPlatformAdmin(user: Pick<SessionUser, "email" | "isPlatformAdmin">): boolean {
  if (user.isPlatformAdmin) return true;
  return platformAdminEmails().includes(user.email.toLowerCase());
}
