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

function hasCurrentSchema(): boolean {
  if (!("SubscriptionPlan" in Prisma)) return false;

  const userModel = Prisma.dmmf.datamodel.models.find((m) => m.name === "User");
  const locationModel = Prisma.dmmf.datamodel.models.find((m) => m.name === "Location");

  return Boolean(
    userModel?.fields.some((f) => f.name === "avatarUrl") &&
      locationModel?.fields.some((f) => f.name === "autopayEnabled") &&
      Prisma.dmmf.datamodel.models.some((m) => m.name === "RolePermissionSet")
  );
}

function getPrismaClient() {
  const cached = globalForPrisma.prisma;
  // Hot reload can keep an older Prisma client missing newly added fields.
  if (cached && hasCurrentSchema()) {
    return cached;
  }
  const client = createPrismaClient();
  if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma = client;
  }
  return client;
}

export const prisma = getPrismaClient();
