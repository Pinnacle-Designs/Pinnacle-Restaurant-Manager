/** Pro clean workspace account — Edge-safe (no Prisma / Node crypto). */
export const PRO_CLEAN_DEFAULT_EMAIL = "pro-clean@pinnacle.app";
export const PRO_CLEAN_LOGIN_PATH = "/login/pro";
/** Post-purchase install step — same path real Stripe checkout uses. */
export const PRO_CLEAN_POST_CHECKOUT_PATH = "/download?from=checkout";

export function isProCleanAccountEmail(email: string): boolean {
  return email.trim().toLowerCase() === PRO_CLEAN_DEFAULT_EMAIL;
}
