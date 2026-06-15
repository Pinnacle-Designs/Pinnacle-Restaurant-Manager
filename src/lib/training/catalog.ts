import type { TrainingModuleKind } from "@prisma/client";

export type CertTypeKey =
  | "servsafe_manager"
  | "servsafe_food_handler"
  | "food_handler_card"
  | "tips_alcohol"
  | "allergen_awareness"
  | "liquor_liability";

export const CERTIFICATION_TYPES: {
  key: CertTypeKey;
  label: string;
  defaultValidityMonths: number | null;
  requiredForRoles: string[];
  auditCritical: boolean;
}[] = [
  {
    key: "servsafe_manager",
    label: "ServSafe Manager",
    defaultValidityMonths: 60,
    requiredForRoles: ["Manager", "Head Chef"],
    auditCritical: true,
  },
  {
    key: "servsafe_food_handler",
    label: "ServSafe Food Handler",
    defaultValidityMonths: 36,
    requiredForRoles: ["Line Cook", "Prep Cook", "Sous Chef", "Head Chef"],
    auditCritical: true,
  },
  {
    key: "food_handler_card",
    label: "Local food handler card",
    defaultValidityMonths: 36,
    requiredForRoles: ["Server", "Bartender", "Host", "Line Cook", "Prep Cook"],
    auditCritical: true,
  },
  {
    key: "tips_alcohol",
    label: "TIPS / alcohol service",
    defaultValidityMonths: 36,
    requiredForRoles: ["Bartender", "Server"],
    auditCritical: true,
  },
  {
    key: "allergen_awareness",
    label: "Allergen awareness",
    defaultValidityMonths: 24,
    requiredForRoles: ["Server", "Line Cook", "Head Chef"],
    auditCritical: false,
  },
  {
    key: "liquor_liability",
    label: "Liquor liability / dram shop",
    defaultValidityMonths: 12,
    requiredForRoles: ["Manager", "Bartender"],
    auditCritical: true,
  },
];

export type TrainingModuleKey =
  | "sexual_harassment"
  | "workplace_safety"
  | "slip_trip_fall"
  | "emergency_procedures"
  | "food_safety_refresher";

export const DEFAULT_TRAINING_MODULES: {
  moduleKey: TrainingModuleKey;
  title: string;
  kind: TrainingModuleKind;
  summary: string;
  content: string;
  estimatedMinutes: number;
  required: boolean;
  renewalMonths: number | null;
}[] = [
  {
    moduleKey: "sexual_harassment",
    title: "Sexual harassment prevention",
    kind: "COMPLIANCE",
    summary:
      "Recognize prohibited conduct, reporting channels, and manager responsibilities under workplace anti-harassment policy.",
    content: `## Sexual harassment prevention

All team members must understand what constitutes harassment and how to report concerns.

**You will learn:**
- Definitions of harassment, discrimination, and retaliation
- Examples of unacceptable behavior on the floor and in the back of house
- How to report to a manager or owner confidentially
- Bystander intervention basics

**Manager duty:** Take every report seriously, document promptly, and escalate to ownership when required.

By completing this module you confirm you have reviewed this material and understand your obligations.`,
    estimatedMinutes: 20,
    required: true,
    renewalMonths: 12,
  },
  {
    moduleKey: "workplace_safety",
    title: "Workplace safety fundamentals",
    kind: "SAFETY",
    summary:
      "PPE, chemical safety, knife handling, burns, and OSHA-aligned safe work practices for restaurant environments.",
    content: `## Workplace safety

Restaurant work involves heat, sharp tools, wet floors, and chemicals. Follow these standards every shift.

**Key topics:**
- Proper footwear and non-slip mats
- Knife safety and cutting board stability
- Burn prevention at fryers, grills, and ovens
- SDS sheets for cleaning chemicals — never mix bleach and ammonia
- Lifting technique for kegs, boxes, and bus tubs

Report hazards immediately. Near-misses should be logged so we can prevent injuries.`,
    estimatedMinutes: 15,
    required: true,
    renewalMonths: 12,
  },
  {
    moduleKey: "slip_trip_fall",
    title: "Slip, trip & fall prevention",
    kind: "SAFETY",
    summary: "Floor safety, spill response, cord management, and ladder use in the restaurant.",
    content: `## Slip, trip & fall prevention

Slips are a top cause of restaurant injuries.

**Rules:**
- Mark wet floors and clean spills within 2 minutes
- Keep walkways clear of boxes and cords
- Use wet-floor signs during mopping
- Three points of contact on ladders and step stools
- Report damaged flooring or drains

Never run in the kitchen or dining room.`,
    estimatedMinutes: 10,
    required: true,
    renewalMonths: 12,
  },
  {
    moduleKey: "emergency_procedures",
    title: "Emergency procedures",
    kind: "SAFETY",
    summary: "Fire, medical, active threat, and evacuation procedures specific to the restaurant.",
    content: `## Emergency procedures

Know your role during an emergency before one happens.

**Fire:** R.A.C.E. — Rescue, Alarm, Contain, Extinguish/Evacuate. Know extinguisher locations.
**Medical:** Call 911 first for serious injury. Designated first-aid kit locations.
**Evacuation:** Primary and secondary exits; assembly point outside the building.
**Power loss:** Secure walk-ins, hold cold food, follow manager direction.

Participate in drills when scheduled.`,
    estimatedMinutes: 12,
    required: true,
    renewalMonths: 12,
  },
  {
    moduleKey: "food_safety_refresher",
    title: "Food safety refresher",
    kind: "CERTIFICATION",
    summary: "Temperature danger zone, cross-contamination, hand washing, and illness reporting.",
    content: `## Food safety refresher

Health department audits focus on these areas:

- **Hand washing:** 20 seconds, after breaks, raw protein, trash, or money
- **Temperatures:** Cold ≤ 41°F, hot ≥ 135°F, document logs
- **Cross-contamination:** Separate boards, store raw below ready-to-eat
- **Illness:** Vomiting, diarrhea, jaundice, or sore throat with fever — do not work, report to manager
- **Date marking:** FIFO and discard by use-by dates

When in doubt, throw it out.`,
    estimatedMinutes: 15,
    required: true,
    renewalMonths: 6,
  },
];

export function certTypeLabel(key: string): string {
  return CERTIFICATION_TYPES.find((c) => c.key === key)?.label ?? key;
}

export function certTypeMeta(key: string) {
  return CERTIFICATION_TYPES.find((c) => c.key === key);
}
