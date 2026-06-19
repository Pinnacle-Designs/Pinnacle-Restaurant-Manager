import type { RoleRateInput, StaffInput } from "./types";

export function getEffectiveRate(
  staff: StaffInput,
  workRole: string | null | undefined,
  roleRates: RoleRateInput[]
): { role: string; rate: number; tipPoints: number; isTipped: boolean } {
  const role = workRole || staff.role;
  const match = roleRates.find((r) => r.staffMemberId === staff.id && r.role === role);
  if (match) {
    return {
      role,
      rate: match.hourlyRate,
      tipPoints: match.tipPoints,
      isTipped: match.isTippedRole,
    };
  }
  return {
    role,
    rate: staff.hourlyRate,
    tipPoints: staff.tipPoints,
    isTipped: staff.isTippedEmployee,
  };
}
