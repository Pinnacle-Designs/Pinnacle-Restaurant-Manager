export type ModifierSelection = {
  groupId: string;
  groupName: string;
  optionId: string;
  optionName: string;
  priceDelta: number;
};

export type ModifierGroupConfig = {
  id: string;
  name: string;
  slug: string;
  required: boolean;
  minSelect: number;
  maxSelect: number;
  sortOrder: number;
  layout?: string;
  options: {
    id: string;
    name: string;
    priceDelta: number;
    isDefault: boolean;
    fractionCoverage?: string | null;
    kitchenStationId?: string | null;
  }[];
};

export function parseCategories(value: string | null | undefined): string[] {
  if (!value) return [];
  return value.split(",").map((c) => c.trim()).filter(Boolean);
}

export function resolveModifierGroupsForItem(
  menuItem: { id: string; category: string },
  allGroups: (ModifierGroupConfig & { categories: string | null; menuItemId: string | null })[]
): ModifierGroupConfig[] {
  const itemSpecific = allGroups
    .filter((g) => g.menuItemId === menuItem.id)
    .map(stripGroup);

  const categoryGlobal = allGroups
    .filter((g) => {
      if (g.menuItemId) return false;
      const cats = parseCategories(g.categories);
      if (cats.length > 0 && !cats.includes(menuItem.category)) return false;
      // Smart modifier sets: optional category groups apply to every item in the category
      if (!g.required && g.minSelect === 0) return true;
      // Required category rules only when the item has no item-specific groups
      if (itemSpecific.length > 0) return false;
      return cats.length === 0 || cats.includes(menuItem.category);
    })
    .map(stripGroup);

  return [...itemSpecific, ...categoryGlobal].sort((a, b) => a.sortOrder - b.sortOrder);
}

function stripGroup(
  g: ModifierGroupConfig & { categories: string | null; menuItemId: string | null }
): ModifierGroupConfig {
  return {
    id: g.id,
    name: g.name,
    slug: g.slug,
    required: g.required,
    minSelect: g.minSelect,
    maxSelect: g.maxSelect,
    sortOrder: g.sortOrder,
    layout: g.layout,
    options: g.options,
  };
}

export function hasFractionalPieLayout(groups: ModifierGroupConfig[]): boolean {
  return groups.some((g) => g.layout === "FRACTIONAL_PIE");
}

export function hasRequiredModifiers(groups: ModifierGroupConfig[]): boolean {
  return groups.some((g) => g.required || g.minSelect > 0);
}

/** Open wizard when an item has any item-specific or category modifier groups. */
export function shouldOpenModifierWizard(groups: ModifierGroupConfig[]): boolean {
  return groups.length > 0;
}

/** Step-by-step prompts for multiple forced questions (e.g. cook temp → two sides). */
export function isConversationalModifierFlow(groups: ModifierGroupConfig[]): boolean {
  const mandatory = groups.filter((g) => g.required || g.minSelect > 0);
  const optional = groups.filter((g) => !g.required && g.minSelect === 0);
  if (mandatory.length > 1) return true;
  if (mandatory.length === 1 && optional.length > 0) return true;
  return false;
}

/** Ordered wizard steps: each forced group, then optional category extras together. */
export function modifierWizardSteps(groups: ModifierGroupConfig[]): ModifierGroupConfig[][] {
  const mandatory = groups.filter((g) => g.required || g.minSelect > 0);
  const optional = groups.filter((g) => !g.required && g.minSelect === 0);
  return [...mandatory.map((g) => [g]), ...(optional.length > 0 ? [optional] : [])];
}

export function defaultSelections(groups: ModifierGroupConfig[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const group of groups) {
    const defaults = group.options.filter((o) => o.isDefault).map((o) => o.id);
    if (defaults.length > 0) {
      out[group.id] = defaults.slice(0, group.maxSelect);
    } else if (group.options.length > 0 && group.minSelect > 0) {
      out[group.id] = [group.options[0].id];
    } else {
      out[group.id] = [];
    }
  }
  return out;
}

/**
 * For forced modifiers, required groups start empty so the server must tap each choice.
 * Optional category groups still get defaults for quick "Fire defaults".
 */
export function initialModifierSelections(
  groups: ModifierGroupConfig[],
  opts?: { forceExplicitRequired?: boolean }
): Record<string, string[]> {
  const forceExplicit =
    opts?.forceExplicitRequired ?? hasRequiredModifiers(groups);
  if (!forceExplicit) return defaultSelections(groups);

  const out: Record<string, string[]> = {};
  for (const group of groups) {
    if (group.required || group.minSelect > 0) {
      out[group.id] = [];
    } else {
      const defaults = group.options.filter((o) => o.isDefault).map((o) => o.id);
      out[group.id] = defaults.slice(0, group.maxSelect);
    }
  }
  return out;
}

export function validateSelections(
  groups: ModifierGroupConfig[],
  selected: Record<string, string[]>
): { ok: true } | { ok: false; message: string } {
  for (const group of groups) {
    const picks = selected[group.id] ?? [];
    if (group.required && picks.length < Math.max(1, group.minSelect)) {
      return { ok: false, message: `Select ${group.name.toLowerCase()}.` };
    }
    if (picks.length < group.minSelect) {
      return { ok: false, message: `Pick at least ${group.minSelect} for ${group.name}.` };
    }
    if (picks.length > group.maxSelect) {
      return { ok: false, message: `At most ${group.maxSelect} for ${group.name}.` };
    }
  }
  return { ok: true };
}

export function buildModifierPayload(
  groups: ModifierGroupConfig[],
  selected: Record<string, string[]>
): { selections: ModifierSelection[]; summary: string; priceDelta: number } {
  const selections: ModifierSelection[] = [];
  let priceDelta = 0;
  const summaryParts: string[] = [];

  for (const group of groups) {
    const picks = selected[group.id] ?? [];
    for (const optionId of picks) {
      const option = group.options.find((o) => o.id === optionId);
      if (!option) continue;
      selections.push({
        groupId: group.id,
        groupName: group.name,
        optionId: option.id,
        optionName: option.name,
        priceDelta: option.priceDelta,
      });
      priceDelta += option.priceDelta;
      summaryParts.push(option.name);
    }
  }

  return {
    selections,
    summary: summaryParts.join(", "),
    priceDelta: Math.round(priceDelta * 100) / 100,
  };
}
