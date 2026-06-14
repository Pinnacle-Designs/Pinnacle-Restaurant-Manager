import { PrismaClient, Prisma } from "@prisma/client";
import { ensureRuntimeDatabase } from "./ensure-runtime-db";

ensureRuntimeDatabase();

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient() {
  return new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}

function hasCurrentSchema(client: PrismaClient): boolean {
  return (
    "websiteConnection" in client &&
    "vendorPriceHistory" in client &&
    "inventoryWaste" in client &&
    "orderPayment" in client &&
    "orderCheck" in client &&
    "SubscriptionPlan" in Prisma
  );
}

function getPrismaClient() {
  const cached = globalForPrisma.prisma;
  // Hot reload can keep an older Prisma client missing newly added models.
  if (cached && hasCurrentSchema(cached)) {
    return cached;
  }
  const client = createPrismaClient();
  if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma = client;
  }
  return client;
}

export const prisma = getPrismaClient();
