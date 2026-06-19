import type { AppRole, SubscriptionPlan } from "@prisma/client";
import { prisma } from "./prisma";
import { hashPassword } from "./auth";
import { OWNER_DEMO_EMAIL } from "./demo-email";

/** Embed / marketing live-demo accounts — not for normal sign-in. */
export { OWNER_DEMO_EMAIL, isDemoAccountEmail, isPlanDemoAccountEmail } from "./demo-email";

export const DEMO_USERS: Array<{
  email: string;
  password: string;
  name: string;
  role: AppRole;
}> = [
  { email: OWNER_DEMO_EMAIL, password: "demo1234", name: "Marcus Reed", role: "OWNER" },
  { email: "manager@pinnacle.com", password: "demo1234", name: "Elena Vasquez", role: "MANAGER" },
  { email: "server@pinnacle.com", password: "demo1234", name: "Priya Nair", role: "SERVER" },
  { email: "kitchen@pinnacle.com", password: "demo1234", name: "Marcus Reed", role: "KITCHEN" },
  { email: "host@pinnacle.com", password: "demo1234", name: "Riley Brooks", role: "HOST" },
];

/** Private plan-tier test accounts — local dev only (see planDemoLoginEnabled). */
export const PLAN_DEMO_USERS: Array<{
  email: string;
  password: string;
  name: string;
  role: AppRole;
  plan: SubscriptionPlan;
  locationName: string;
}> = [
  {
    email: "demo-starter@pinnacle.com",
    password: "demo1234",
    name: "Starter Demo",
    role: "OWNER",
    plan: "STARTER",
    locationName: "Plan Demo - Starter",
  },
  {
    email: "demo-growth@pinnacle.com",
    password: "demo1234",
    name: "Growth Demo",
    role: "OWNER",
    plan: "GROWTH",
    locationName: "Plan Demo - Growth",
  },
  {
    email: "demo-pro@pinnacle.com",
    password: "demo1234",
    name: "Pro Demo",
    role: "OWNER",
    plan: "PRO",
    locationName: "Plan Demo - Pro",
  },
];

/** True when private plan demo accounts may sign in via /login (never on public marketing). */
export function planDemoLoginEnabled(): boolean {
  return (
    process.env.NODE_ENV === "development" ||
    process.env.PLAN_DEMO_LOGIN_ENABLED === "true"
  );
}

/** True when embed demo accounts (owner@pinnacle.com, etc.) may sign in via /login. */
export function devDemoLoginEnabled(): boolean {
  return planDemoLoginEnabled();
}

/** Create or reset all embed demo login accounts. */
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
        emailVerifiedAt: new Date(),
      },
      update: {
        passwordHash: hashPassword(user.password),
        name: user.name,
        role: user.role,
        active: true,
        emailVerifiedAt: new Date(),
      },
    });
  }

  const { seedPlatformDemos } = await import("./seed-platform");
  await seedPlatformDemos();

  return DEMO_USERS.map((u) => ({
    email: u.email,
    role: u.role,
    password: u.password,
  }));
}

/** Create or reset private plan-tier demo workspaces. */
export async function seedPlanDemoUsers() {
  const seeded = [];

  for (const demo of PLAN_DEMO_USERS) {
    const existingUser = await prisma.user.findUnique({
      where: { email: demo.email },
      select: { locationId: true },
    });

    let location =
      existingUser?.locationId != null
        ? await prisma.location.findUnique({ where: { id: existingUser.locationId } })
        : await prisma.location.findFirst({ where: { name: demo.locationName } });

    if (location) {
      location = await prisma.location.update({
        where: { id: location.id },
        data: { name: demo.locationName, plan: demo.plan, active: true },
      });
    } else {
      location = await prisma.location.create({
        data: {
          name: demo.locationName,
          address: "Dev plan demo workspace",
          plan: demo.plan,
        },
      });
    }

    await prisma.user.upsert({
      where: { email: demo.email },
      create: {
        email: demo.email,
        passwordHash: hashPassword(demo.password),
        name: demo.name,
        role: demo.role,
        locationId: location.id,
        active: true,
        emailVerifiedAt: new Date(),
      },
      update: {
        passwordHash: hashPassword(demo.password),
        name: demo.name,
        role: demo.role,
        locationId: location.id,
        active: true,
        emailVerifiedAt: new Date(),
      },
    });

    seeded.push({
      email: demo.email,
      password: demo.password,
      plan: demo.plan,
      locationName: demo.locationName,
    });
  }

  return seeded;
}
