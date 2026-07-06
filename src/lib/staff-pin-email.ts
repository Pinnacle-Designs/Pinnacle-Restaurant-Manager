const STAFF_PIN_EMAIL_PREFIX = "staff.";

/** Internal email for staff PIN logins — never shown to users. */
export function staffPinLoginEmail(locationId: string, staffMemberId: string): string {
  return `${STAFF_PIN_EMAIL_PREFIX}${staffMemberId}@loc.${locationId.slice(0, 12)}.pinnacle`;
}

export function isStaffPinLoginEmail(email: string): boolean {
  return email.trim().toLowerCase().startsWith(STAFF_PIN_EMAIL_PREFIX);
}
