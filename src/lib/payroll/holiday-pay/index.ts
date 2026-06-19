export * from "./types";
export * from "./templates";
export * from "./engine";

import type { HolidayPayRule } from "@prisma/client";
import type { HolidayPayRuleInput } from "./types";
import { getHolidayPayTemplate } from "./templates";

export function defaultHolidayPayRule(): HolidayPayRuleInput {
  return {
    enabled: false,
    templateId: null,
    ruleName: "Custom",
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
  };
}

export function holidayRuleFromDb(row: HolidayPayRule): HolidayPayRuleInput {
  return {
    enabled: row.enabled,
    templateId: row.templateId,
    ruleName: row.ruleName,
    tenureDaysRequired: row.tenureDaysRequired,
    requireFirstLastShift: row.requireFirstLastShift,
    lookbackDays: row.lookbackDays,
    denominatorMode: row.denominatorMode,
    fixedDivisor: row.fixedDivisor,
    annualPercentage: row.annualPercentage,
    holidayPremiumMultiplier: row.holidayPremiumMultiplier,
    substituteDayEnabled: row.substituteDayEnabled,
    substituteDayMultiplier: row.substituteDayMultiplier,
    payStatutoryWhenOff: row.payStatutoryWhenOff,
  };
}

export function applyHolidayPayTemplate(
  templateId: string,
  current?: Partial<HolidayPayRuleInput>
): HolidayPayRuleInput {
  const template = getHolidayPayTemplate(templateId);
  const base = defaultHolidayPayRule();
  if (!template) {
    return { ...base, ...current, templateId };
  }
  return {
    ...base,
    ...current,
    templateId,
    ruleName: template.rule.ruleName,
    tenureDaysRequired: template.rule.tenureDaysRequired,
    requireFirstLastShift: template.rule.requireFirstLastShift,
    lookbackDays: template.rule.lookbackDays,
    denominatorMode: template.rule.denominatorMode,
    fixedDivisor: template.rule.fixedDivisor,
    annualPercentage: template.rule.annualPercentage,
    holidayPremiumMultiplier: template.rule.holidayPremiumMultiplier,
    substituteDayEnabled: template.rule.substituteDayEnabled,
    substituteDayMultiplier: template.rule.substituteDayMultiplier,
    payStatutoryWhenOff: template.rule.payStatutoryWhenOff,
  };
}
