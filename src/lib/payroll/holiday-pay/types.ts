import type { HolidayDenominatorMode } from "@prisma/client";

export interface HolidayPayRuleInput {
  enabled: boolean;
  templateId: string | null;
  ruleName: string;
  tenureDaysRequired: number;
  requireFirstLastShift: boolean;
  lookbackDays: number;
  denominatorMode: HolidayDenominatorMode;
  fixedDivisor: number;
  annualPercentage: number | null;
  holidayPremiumMultiplier: number;
  substituteDayEnabled: boolean;
  substituteDayMultiplier: number;
  payStatutoryWhenOff: boolean;
}

export interface HolidayDateInput {
  date: Date | string;
  name: string;
}

export interface StaffHolidayInput {
  id: string;
  hireDate: Date | string | null;
}

export interface HolidayPayDetail {
  holidayDate: string;
  holidayName: string;
  eligible: boolean;
  ineligibleReason?: string;
  hoursWorked: number;
  statutoryPay: number;
  premiumPay: number;
  accruedDaysOff: number;
}

export interface EmployeeHolidayPayResult {
  staffMemberId: string;
  statutoryPay: number;
  premiumPay: number;
  totalHolidayPay: number;
  accruedDaysOff: number;
  details: HolidayPayDetail[];
}

export interface HolidayPaySummary {
  enabled: boolean;
  delegatedToProvider: boolean;
  provider: string | null;
  employees: EmployeeHolidayPayResult[];
  totals: {
    statutoryPay: number;
    premiumPay: number;
    holidayPay: number;
    accruedDaysOff: number;
  };
}

export interface HolidayPayTemplate {
  id: string;
  name: string;
  region: string;
  description: string;
  rule: Omit<HolidayPayRuleInput, "enabled" | "templateId">;
}
