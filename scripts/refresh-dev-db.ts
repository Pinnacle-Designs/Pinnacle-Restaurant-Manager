import { seedDemoUsers } from "../src/lib/demo-users";
import { setupDemoWorkspace } from "../src/lib/seed-data";
import { seedMenuRecipes } from "../src/lib/menu/seed-recipes";
import { prisma } from "../src/lib/prisma";

async function main() {
  await seedDemoUsers();
  const workspace = await setupDemoWorkspace("seeded");
  await seedMenuRecipes(workspace.locationId);
  await prisma.user.update({
    where: { email: "owner@pinnacle.com" },
    data: { locationId: workspace.locationId },
  });
  console.log(`[db] Seeded ${workspace.locationName} (${workspace.locationId})`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("[db] Refresh failed:", err);
  process.exit(1);
});
