export function lineTheoreticalCost(
  quantity: number,
  costPerUnit: number,
  yieldPct: number
): number {
  const yieldFactor = Math.max(yieldPct, 1) / 100;
  return Math.round(quantity * costPerUnit * (1 / yieldFactor) * 100) / 100;
}

/** Raw purchase qty needed to produce sellable qty after trim/cook loss. */
export function rawQuantityForSellable(sellableQty: number, yieldPct: number): number {
  const yieldFactor = Math.max(yieldPct, 1) / 100;
  return Math.round((sellableQty / yieldFactor) * 100) / 100;
}

export function computeRecipeCostFromLines(
  lines: Array<{ quantity: number; inventoryItem: { costPerUnit: number; yieldPct: number } }>
): number {
  const total = lines.reduce(
    (sum, line) =>
      sum + lineTheoreticalCost(line.quantity, line.inventoryItem.costPerUnit, line.inventoryItem.yieldPct),
    0
  );
  return Math.round(total * 100) / 100;
}
