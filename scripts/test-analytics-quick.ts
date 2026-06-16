import { PrismaClient } from "@prisma/client";
import { computeAnalytics } from "../src/lib/analytics/compute";

const prisma = new PrismaClient();

async function main() {
  const loc = await prisma.location.findFirst();
  if (!loc) {
    console.log("NO_LOCATION");
    process.exit(1);
  }
  console.log("Location:", loc.name);
  const start = Date.now();
  const data = await computeAnalytics(loc.id);
  console.log("analytics OK in", Date.now() - start, "ms", "netSales", data.sales.netSales);
}

main()
  .catch((e) => {
    console.error("FAIL:", e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
