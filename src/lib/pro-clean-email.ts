/** Pro clean workspace account — Edge-safe (no Prisma / Node crypto). */
export const PRO_CLEAN_DEFAULT_EMAIL = "pro-clean@pinnacle.app";

export function isProCleanAccountEmail(email: string): boolean {
  return email.trim().toLowerCase() === PRO_CLEAN_DEFAULT_EMAIL;
}
