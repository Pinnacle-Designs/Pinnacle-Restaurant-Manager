/**
 * Smoky Oak BBQ — single source of truth for inventory ingredients and menu recipes.
 */

export type InventoryCatalogItem = {
  name: string;
  quantity: number;
  unit: string;
  minQuantity: number;
  costPerUnit: number;
  previousCostPerUnit?: number;
  portionSize?: number;
  yieldPct?: number;
  supplier: string;
  barcode?: string;
};

export type RecipeCatalogLine = {
  ingredient: string;
  quantity: number;
};

/** Every ingredient used across the demo menu — seeded into Inventory. */
export const BBQ_INVENTORY_CATALOG: InventoryCatalogItem[] = [
  // Proteins
  { name: "Beef brisket", quantity: 42, unit: "lbs", minQuantity: 30, costPerUnit: 6.8, previousCostPerUnit: 6.4, portionSize: 0.45, yieldPct: 88, supplier: "Hill Country Meats", barcode: "MEAT-BRISKET-01" },
  { name: "Pork shoulder", quantity: 28, unit: "lbs", minQuantity: 20, costPerUnit: 3.2, previousCostPerUnit: 3.0, portionSize: 0.35, yieldPct: 85, supplier: "Hill Country Meats", barcode: "MEAT-PORK-01" },
  { name: "St. Louis ribs", quantity: 18, unit: "racks", minQuantity: 12, costPerUnit: 14.5, previousCostPerUnit: 13.8, portionSize: 0.5, yieldPct: 90, supplier: "Hill Country Meats", barcode: "MEAT-RIBS-01" },
  { name: "Chicken quarters", quantity: 24, unit: "each", minQuantity: 16, costPerUnit: 1.85, previousCostPerUnit: 1.75, portionSize: 1, yieldPct: 92, supplier: "Farm Fresh Poultry", barcode: "MEAT-CHKN-01" },
  { name: "Bacon strips", quantity: 15, unit: "lbs", minQuantity: 8, costPerUnit: 6.2, portionSize: 0.08, yieldPct: 100, supplier: "Hill Country Meats", barcode: "MEAT-BACON-01" },
  // Bakery & starch
  { name: "Brioche buns", quantity: 120, unit: "each", minQuantity: 80, costPerUnit: 0.55, portionSize: 1, yieldPct: 100, supplier: "Local Bakery Co", barcode: "BKRY-BUN-01" },
  { name: "Elbow macaroni", quantity: 16, unit: "lbs", minQuantity: 10, costPerUnit: 1.4, portionSize: 0.12, yieldPct: 100, supplier: "Bulk Foods Co", barcode: "DRY-MAC-01" },
  { name: "Cornmeal mix", quantity: 18, unit: "lbs", minQuantity: 10, costPerUnit: 1.8, portionSize: 0.1, yieldPct: 100, supplier: "Bulk Foods Co", barcode: "DRY-CORN-01" },
  // Dairy
  { name: "Sharp cheddar", quantity: 20, unit: "lbs", minQuantity: 8, costPerUnit: 4.2, portionSize: 0.08, yieldPct: 100, supplier: "Bulk Foods Co", barcode: "DAIRY-CHDR-01" },
  { name: "Cream cheese", quantity: 8, unit: "lbs", minQuantity: 4, costPerUnit: 4.8, portionSize: 0.06, yieldPct: 100, supplier: "Bulk Foods Co", barcode: "DAIRY-CCHE-01" },
  { name: "Unsalted butter", quantity: 12, unit: "lbs", minQuantity: 6, costPerUnit: 5.4, portionSize: 0.04, yieldPct: 100, supplier: "Bulk Foods Co", barcode: "DAIRY-BUTR-01" },
  { name: "Whole milk", quantity: 8, unit: "gal", minQuantity: 4, costPerUnit: 4.6, portionSize: 0.06, yieldPct: 100, supplier: "Bulk Foods Co", barcode: "DAIRY-MILK-01" },
  { name: "Vanilla ice cream", quantity: 10, unit: "gal", minQuantity: 4, costPerUnit: 11, portionSize: 0.08, yieldPct: 100, supplier: "Bulk Foods Co", barcode: "DAIRY-ICE-01" },
  // Produce
  { name: "Cabbage", quantity: 14, unit: "heads", minQuantity: 8, costPerUnit: 2.2, previousCostPerUnit: 2.0, portionSize: 0.15, yieldPct: 82, supplier: "Green Valley Produce", barcode: "PROD-CABB-01" },
  { name: "Jalapeños", quantity: 10, unit: "lbs", minQuantity: 4, costPerUnit: 3.5, portionSize: 0.15, yieldPct: 95, supplier: "Green Valley Produce", barcode: "PROD-JALP-01" },
  { name: "Fresh mint", quantity: 2, unit: "lbs", minQuantity: 1, costPerUnit: 8.5, portionSize: 0.01, yieldPct: 90, supplier: "Green Valley Produce", barcode: "PROD-MINT-01" },
  // Sauces & seasonings
  { name: "BBQ dry rub", quantity: 8, unit: "lbs", minQuantity: 4, costPerUnit: 9.5, portionSize: 0.02, yieldPct: 100, supplier: "Smokehouse Supply", barcode: "SAUC-RUB-01" },
  { name: "House BBQ sauce", quantity: 6, unit: "gal", minQuantity: 3, costPerUnit: 18, portionSize: 0.05, yieldPct: 100, supplier: "Smokehouse Supply", barcode: "SAUC-BBQ-01" },
  { name: "Alabama white sauce", quantity: 3, unit: "gal", minQuantity: 2, costPerUnit: 16, portionSize: 0.04, yieldPct: 100, supplier: "Smokehouse Supply", barcode: "SAUC-WHT-01" },
  { name: "Slaw dressing mix", quantity: 4, unit: "gal", minQuantity: 2, costPerUnit: 14, portionSize: 0.04, yieldPct: 100, supplier: "Smokehouse Supply", barcode: "SAUC-SLAW-01" },
  { name: "Dill pickles", quantity: 6, unit: "gal", minQuantity: 3, costPerUnit: 9, portionSize: 0.03, yieldPct: 100, supplier: "Bulk Foods Co", barcode: "SAUC-PICK-01" },
  { name: "Honey", quantity: 4, unit: "lbs", minQuantity: 2, costPerUnit: 7.2, portionSize: 0.02, yieldPct: 100, supplier: "Bulk Foods Co", barcode: "SAUC-HONY-01" },
  // Canned / dry goods
  { name: "Baked beans (canned)", quantity: 24, unit: "cans", minQuantity: 12, costPerUnit: 2.4, portionSize: 0.5, yieldPct: 100, supplier: "Bulk Foods Co", barcode: "CAN-BEAN-01" },
  { name: "Peach pie filling", quantity: 12, unit: "cans", minQuantity: 6, costPerUnit: 5.5, portionSize: 0.25, yieldPct: 100, supplier: "Bulk Foods Co", barcode: "CAN-PEACH-01" },
  { name: "Cobbler topping mix", quantity: 12, unit: "lbs", minQuantity: 6, costPerUnit: 2.1, portionSize: 0.06, yieldPct: 100, supplier: "Bulk Foods Co", barcode: "DRY-COBB-01" },
  { name: "Sweet tea concentrate", quantity: 4, unit: "gal", minQuantity: 2, costPerUnit: 12, portionSize: 0.06, yieldPct: 100, supplier: "Bulk Foods Co", barcode: "BEV-TEA-01" },
  // Bar
  { name: "Craft lager (keg)", quantity: 4, unit: "kegs", minQuantity: 2, costPerUnit: 120, portionSize: 0.02, yieldPct: 100, supplier: "Local Brewery", barcode: "BAR-LAGER-01" },
  { name: "House bourbon", quantity: 8, unit: "bottles", minQuantity: 3, costPerUnit: 28, portionSize: 0.05, yieldPct: 100, supplier: "Bar Supply Co", barcode: "BAR-BOURB-01" },
  { name: "Lemonade mix", quantity: 6, unit: "gal", minQuantity: 3, costPerUnit: 8, portionSize: 0.08, yieldPct: 100, supplier: "Bar Supply Co", barcode: "BAR-LEM-01" },
  // Operations (not in recipes — still stocked)
  { name: "Oak smoking wood", quantity: 12, unit: "bags", minQuantity: 6, costPerUnit: 22, portionSize: 0.25, yieldPct: 100, supplier: "Texas Fuel & Wood", barcode: "OPS-WOOD-01" },
];

/** Menu item name → ingredient build (inventory item names + quantities per plate). */
export const BBQ_MENU_RECIPES: Record<string, RecipeCatalogLine[]> = {
  "Smoked Brisket Plate": [
    { ingredient: "Beef brisket", quantity: 0.45 },
    { ingredient: "BBQ dry rub", quantity: 0.01 },
    { ingredient: "House BBQ sauce", quantity: 0.05 },
    { ingredient: "Elbow macaroni", quantity: 0.12 },
    { ingredient: "Sharp cheddar", quantity: 0.06 },
    { ingredient: "Cabbage", quantity: 0.1 },
    { ingredient: "Slaw dressing mix", quantity: 0.04 },
  ],
  "St. Louis Ribs (Half Rack)": [
    { ingredient: "St. Louis ribs", quantity: 0.5 },
    { ingredient: "BBQ dry rub", quantity: 0.02 },
    { ingredient: "House BBQ sauce", quantity: 0.03 },
  ],
  "Pulled Pork Sandwich": [
    { ingredient: "Pork shoulder", quantity: 0.35 },
    { ingredient: "Brioche buns", quantity: 1 },
    { ingredient: "House BBQ sauce", quantity: 0.04 },
    { ingredient: "Cabbage", quantity: 0.12 },
    { ingredient: "Slaw dressing mix", quantity: 0.03 },
    { ingredient: "Dill pickles", quantity: 0.03 },
  ],
  "Smoked Chicken Quarter": [
    { ingredient: "Chicken quarters", quantity: 1 },
    { ingredient: "BBQ dry rub", quantity: 0.015 },
    { ingredient: "Alabama white sauce", quantity: 0.04 },
  ],
  "Mac & Cheese": [
    { ingredient: "Elbow macaroni", quantity: 0.12 },
    { ingredient: "Sharp cheddar", quantity: 0.08 },
    { ingredient: "Unsalted butter", quantity: 0.03 },
    { ingredient: "Whole milk", quantity: 0.06 },
  ],
  Coleslaw: [
    { ingredient: "Cabbage", quantity: 0.15 },
    { ingredient: "Slaw dressing mix", quantity: 0.04 },
  ],
  "Sweet Tea": [{ ingredient: "Sweet tea concentrate", quantity: 0.06 }],
  "Peach Cobbler": [
    { ingredient: "Peach pie filling", quantity: 0.25 },
    { ingredient: "Cobbler topping mix", quantity: 0.06 },
    { ingredient: "Unsalted butter", quantity: 0.02 },
    { ingredient: "Vanilla ice cream", quantity: 0.08 },
  ],
  "Brisket Sandwich": [
    { ingredient: "Beef brisket", quantity: 0.3 },
    { ingredient: "Brioche buns", quantity: 1 },
    { ingredient: "House BBQ sauce", quantity: 0.04 },
    { ingredient: "Cabbage", quantity: 0.08 },
    { ingredient: "Slaw dressing mix", quantity: 0.02 },
    { ingredient: "Dill pickles", quantity: 0.02 },
  ],
  "Baked Beans": [
    { ingredient: "Baked beans (canned)", quantity: 0.5 },
    { ingredient: "House BBQ sauce", quantity: 0.02 },
    { ingredient: "Bacon strips", quantity: 0.04 },
  ],
  Cornbread: [
    { ingredient: "Cornmeal mix", quantity: 0.1 },
    { ingredient: "Unsalted butter", quantity: 0.03 },
    { ingredient: "Honey", quantity: 0.02 },
  ],
  "Draft Beer": [{ ingredient: "Craft lager (keg)", quantity: 0.02 }],
  "Bourbon Lemonade": [
    { ingredient: "House bourbon", quantity: 0.05 },
    { ingredient: "Lemonade mix", quantity: 0.08 },
    { ingredient: "Fresh mint", quantity: 0.01 },
  ],
  "Burnt Ends": [
    { ingredient: "Beef brisket", quantity: 0.35 },
    { ingredient: "BBQ dry rub", quantity: 0.015 },
    { ingredient: "House BBQ sauce", quantity: 0.06 },
  ],
  "Jalapeño Poppers": [
    { ingredient: "Jalapeños", quantity: 0.15 },
    { ingredient: "Cream cheese", quantity: 0.06 },
    { ingredient: "Bacon strips", quantity: 0.08 },
  ],
  "Pitmaster Sampler": [
    { ingredient: "Beef brisket", quantity: 0.45 },
    { ingredient: "St. Louis ribs", quantity: 0.5 },
    { ingredient: "BBQ dry rub", quantity: 0.025 },
    { ingredient: "House BBQ sauce", quantity: 0.06 },
    { ingredient: "Elbow macaroni", quantity: 0.12 },
    { ingredient: "Cabbage", quantity: 0.1 },
    { ingredient: "Slaw dressing mix", quantity: 0.04 },
  ],
};

/** Collect every ingredient referenced in recipes (for validation). */
export function allRecipeIngredientNames(): string[] {
  const names = new Set<string>();
  for (const lines of Object.values(BBQ_MENU_RECIPES)) {
    for (const line of lines) names.add(line.ingredient);
  }
  return [...names].sort();
}
