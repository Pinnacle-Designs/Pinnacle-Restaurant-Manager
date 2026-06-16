import { PrismaClient, Prisma } from "@prisma/client";
import { ensureRuntimeDatabase } from "./ensure-runtime-db";

ensureRuntimeDatabase();

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient() {
  const url = process.env.DATABASE_URL ?? "";
  if (url.startsWith("file:") && !url.includes("socket_timeout")) {
    const sep = url.includes("?") ? "&" : "?";
    process.env.DATABASE_URL = `${url}${sep}socket_timeout=30`;
  }
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
      userModel?.fields.some((f) => f.name === "isPlatformAdmin") &&
      locationModel?.fields.some((f) => f.name === "autopayEnabled") &&
      locationModel?.fields.some((f) => f.name === "setupComplete") &&
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
