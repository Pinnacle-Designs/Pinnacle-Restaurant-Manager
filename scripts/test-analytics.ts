import { PrismaClient } from "@prisma/client";
import { computeAnalytics } from "../src/lib/analytics/compute";

const prisma = new PrismaClient();

async function main() {
  const loc = await prisma.location.findFirst();
  if (!loc) {
    console.log("No location found");
    return;
  }
  console.log("Location:", loc.id, loc.name);

  try {
    const inv = await prisma.inventoryItem.findMany({ take: 1 });
    console.log("inventoryItem OK, fields:", inv[0] ? Object.keys(inv[0]).join(", ") : "empty");
  } catch (e) {
    console.error("inventoryItem FAIL:", (e as Error).message);
  }

  try {
    const vph = await prisma.vendorPriceHistory.findMany({ take: 1 });
    console.log("vendorPriceHistory OK, count:", vph.length);
  } catch (e) {
    console.error("vendorPriceHistory FAIL:", (e as Error).message);
  }

  const data = await computeAnalytics(loc.id);
  console.log("computeAnalytics OK");
  console.log("  periodDays:", data.periodDays);
  console.log("  sales.netSales:", data.sales.netSales);
  console.log("  foodCost.highlights:", !!data.foodCost.highlights);
  console.log("  foodCost.inventoryCounts:", data.foodCost.inventoryCounts.length);
}

main()
  .catch((e: unknown) => {
    const err = e as Error;
    console.error("FAILED:", err.message);
    console.error(err.stack);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
