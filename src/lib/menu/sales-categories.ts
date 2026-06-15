export const SALES_CATEGORIES = [
  "FOOD",
  "LIQUOR",
  "DRAFT_BEER",
  "BOTTLED_BEER",
  "WINE",
  "NA_BEVERAGE",
  "MERCHANDISE",
] as const;

export type SalesCategoryId = (typeof SALES_CATEGORIES)[number];

export const SALES_CATEGORY_LABELS: Record<SalesCategoryId, string> = {
  FOOD: "Food",
  LIQUOR: "Liquor",
  DRAFT_BEER: "Draft beer",
  BOTTLED_BEER: "Bottled beer",
  WINE: "Wine",
  NA_BEVERAGE: "Non-alcoholic beverage",
  MERCHANDISE: "Merchandise",
};

export function isSalesCategory(value: string): value is SalesCategoryId {
  return SALES_CATEGORIES.includes(value as SalesCategoryId);
}

export function normalizeSalesCategory(value: string | null | undefined): SalesCategoryId {
  if (value && isSalesCategory(value)) return value;
  return "FOOD";
}

/** Map POS display category → default GL sales category. */
export function defaultSalesCategoryForMenuCategory(category: string): SalesCategoryId {
  const c = category.toLowerCase();
  if (c.includes("beer")) return "DRAFT_BEER";
  if (c.includes("cocktail") || c.includes("liquor")) return "LIQUOR";
  if (c.includes("wine")) return "WINE";
  if (c.includes("beverage")) return "NA_BEVERAGE";
  return "FOOD";
}
