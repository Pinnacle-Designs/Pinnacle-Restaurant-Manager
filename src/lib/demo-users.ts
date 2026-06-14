import type { AppRole } from "@prisma/client";
import { prisma } from "./prisma";
import { hashPassword } from "./auth";

export const DEMO_USERS: Array<{
  email: string;
  password: string;
  name: string;
  role: AppRole;
}> = [
  { email: "owner@pinnacle.com", password: "demo1234", name: "Alex Owner", role: "OWNER" },
  { email: "manager@pinnacle.com", password: "demo1234", name: "Jordan Manager", role: "MANAGER" },
  { email: "server@pinnacle.com", password: "demo1234", name: "Sam Server", role: "SERVER" },
  { email: "kitchen@pinnacle.com", password: "demo1234", name: "Chris Kitchen", role: "KITCHEN" },
  { email: "host@pinnacle.com", password: "demo1234", name: "Taylor Host", role: "HOST" },
];

const DEMO_EMAILS = new Set(DEMO_USERS.map((u) => u.email.toLowerCase()));

export function isDemoAccountEmail(email: string): boolean {
  return DEMO_EMAILS.has(email.trim().toLowerCase());
}

/** Create or reset all demo login accounts. */
export async function seedDemoUsers() {
  for (const user of DEMO_USERS) {
    await prisma.user.upsert({
      where: { email: user.email },
      create: {
        email: user.email,
        passwordHash: hashPassword(user.password),
        name: user.name,
        role: user.role,
        active: true,
      },
      update: {
        passwordHash: hashPassword(user.password),
        name: user.name,
        role: user.role,
        active: true,
      },
    });
  }

  return DEMO_USERS.map((u) => ({
    email: u.email,
    role: u.role,
    password: u.password,
  }));
}
