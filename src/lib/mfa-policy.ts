import type { SessionUser } from "./session";
import { isDemoAccountEmail, isPlanDemoAccountEmail } from "./demo-email";
import { isStaffPinLoginEmail } from "./staff-pin-email";

export function isProductionSecurityEnforced(): boolean {
  return process.env.NODE_ENV === "production";
}

export function isMfaExemptUser(user: Pick<SessionUser, "email" | "isPlatformAdmin">): boolean {
  if (user.isPlatformAdmin) return true;
  const email = user.email.trim().toLowerCase();
  return (
    isDemoAccountEmail(email) ||
    isPlanDemoAccountEmail(email) ||
    isStaffPinLoginEmail(email)
  );
}

export function ownerMfaRequired(user: SessionUser): boolean {
  if (!isProductionSecurityEnforced()) return false;
  if (user.role !== "OWNER") return false;
  if (user.mfaEnabled === true) return false;
  if (user.mfaEnabled === undefined) return false;
  return !isMfaExemptUser(user);
}

export function isMfaSetupAllowedPath(pathname: string): boolean {
  return (
    pathname.startsWith("/account") ||
    pathname.startsWith("/api/account/mfa") ||
    pathname.startsWith("/api/account/password") ||
    pathname.startsWith("/api/auth/logout") ||
    pathname.startsWith("/api/auth/login") ||
    pathname.startsWith("/api/auth/pin-login") ||
    pathname.startsWith("/api/auth/team-roster") ||
    pathname.startsWith("/api/auth/mfa") ||
    pathname.startsWith("/onboarding") ||
    pathname.startsWith("/download")
  );
}

export function emailVerificationRequired(user: SessionUser): boolean {
  if (!isProductionSecurityEnforced()) return false;
  if (user.emailVerifiedAt) return false;
  if (user.emailVerifiedAt === undefined) return false;
  return !isMfaExemptUser(user);
}

export function isEmailVerificationAllowedPath(pathname: string): boolean {
  return (
    isMfaSetupAllowedPath(pathname) ||
    pathname.startsWith("/api/auth/verify-email") ||
    pathname.startsWith("/api/auth/resend-verification") ||
    pathname.startsWith("/verify-email")
  );
}

export function ownerCannotDisableMfa(user: SessionUser): boolean {
  return isProductionSecurityEnforced() && user.role === "OWNER" && !isMfaExemptUser(user);
}
