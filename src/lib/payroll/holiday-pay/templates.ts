import type { HolidayPayTemplate } from "./types";

/** Pre-set rule templates — update here when jurisdictions change, not app logic. */
export const HOLIDAY_PAY_TEMPLATES: HolidayPayTemplate[] = [
  {
    id: "us_worked_premium",
    name: "US — premium when worked",
    region: "United States (general)",
    description:
      "No statutory day-off pay. Employees who work the holiday earn a configurable premium on hours worked.",
    rule: {
      ruleName: "US — premium when worked",
      tenureDaysRequired: 0,
      requireFirstLastShift: false,
      lookbackDays: 28,
      denominatorMode: "DAYS_WORKED",
      fixedDivisor: 20,
      annualPercentage: null,
      holidayPremiumMultiplier: 1.5,
      substituteDayEnabled: false,
      substituteDayMultiplier: 1.0,
      payStatutoryWhenOff: false,
    },
  },
  {
    id: "us_california",
    name: "California — daily OT + holiday premium",
    region: "California, US",
    description:
      "Premium multiplier on holiday hours worked. Pair with daily OT threshold in payroll settings.",
    rule: {
      ruleName: "California — holiday premium",
      tenureDaysRequired: 0,
      requireFirstLastShift: false,
      lookbackDays: 30,
      denominatorMode: "DAYS_WORKED",
      fixedDivisor: 20,
      annualPercentage: null,
      holidayPremiumMultiplier: 1.5,
      substituteDayEnabled: false,
      substituteDayMultiplier: 1.0,
      payStatutoryWhenOff: false,
    },
  },
  {
    id: "ca_ontario",
    name: "Ontario — public holiday pay",
    region: "Ontario, Canada",
    description:
      "30-day tenure, first/last shift rule, 4-week lookback divided by days worked, plus premium when working the holiday.",
    rule: {
      ruleName: "Ontario — public holiday",
      tenureDaysRequired: 30,
      requireFirstLastShift: true,
      lookbackDays: 28,
      denominatorMode: "DAYS_WORKED",
      fixedDivisor: 20,
      annualPercentage: null,
      holidayPremiumMultiplier: 1.5,
      substituteDayEnabled: false,
      substituteDayMultiplier: 1.0,
      payStatutoryWhenOff: true,
    },
  },
  {
    id: "ca_federal",
    name: "Canada — federal (fixed divisor)",
    region: "Canada (federal)",
    description:
      "30-day tenure, 4-week lookback wages divided by 20, statutory pay when off plus premium when worked.",
    rule: {
      ruleName: "Canada — federal",
      tenureDaysRequired: 30,
      requireFirstLastShift: false,
      lookbackDays: 28,
      denominatorMode: "FIXED_DIVISOR",
      fixedDivisor: 20,
      annualPercentage: null,
      holidayPremiumMultiplier: 1.5,
      substituteDayEnabled: false,
      substituteDayMultiplier: 1.0,
      payStatutoryWhenOff: true,
    },
  },
  {
    id: "ca_bc_substitute",
    name: "BC — substitute day off",
    region: "British Columbia, Canada",
    description:
      "Work the holiday at standard rate and accrue a substitute day off instead of a cash premium.",
    rule: {
      ruleName: "BC — substitute day",
      tenureDaysRequired: 30,
      requireFirstLastShift: true,
      lookbackDays: 28,
      denominatorMode: "DAYS_WORKED",
      fixedDivisor: 20,
      annualPercentage: null,
      holidayPremiumMultiplier: 1.0,
      substituteDayEnabled: true,
      substituteDayMultiplier: 1.0,
      payStatutoryWhenOff: true,
    },
  },
  {
    id: "annual_percentage",
    name: "Annual percentage (4%)",
    region: "Configurable",
    description:
      "Statutory holiday pay as a flat percentage of annualized earnings, split across observed holidays.",
    rule: {
      ruleName: "Annual percentage",
      tenureDaysRequired: 30,
      requireFirstLastShift: false,
      lookbackDays: 365,
      denominatorMode: "ANNUAL_PERCENTAGE",
      fixedDivisor: 20,
      annualPercentage: 4,
      holidayPremiumMultiplier: 1.5,
      substituteDayEnabled: false,
      substituteDayMultiplier: 1.0,
      payStatutoryWhenOff: true,
    },
  },
];

export function getHolidayPayTemplate(id: string): HolidayPayTemplate | undefined {
  return HOLIDAY_PAY_TEMPLATES.find((t) => t.id === id);
}
