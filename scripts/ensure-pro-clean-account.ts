/**
 * CLI wrapper — ensure pro-clean account on the database pointed to by DATABASE_URL.
 */
import { ensureProCleanAccount } from "../src/lib/pro-clean-account";

async function main() {
  if (!process.env.DATABASE_URL?.trim()) {
    console.error("[pro-clean] DATABASE_URL not set");
    process.exit(1);
  }

  const result = await ensureProCleanAccount({
    resetPassword: process.argv.includes("--reset"),
  });

  console.log("[pro-clean] Done:", result);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    const { prisma } = await import("../src/lib/prisma");
    await prisma.$disconnect();
  });
