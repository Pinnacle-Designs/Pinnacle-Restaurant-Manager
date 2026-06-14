import { prisma } from "./prisma";

export type DemoMode = "seeded" | "fresh";

export const DEMO_LOCATION_SAMPLE = "Demo - Sample Data";
export const DEMO_LOCATION_BLANK = "Demo - Blank Slate";

/** Legacy names before ASCII hyphen fix */
const LEGACY_DEMO_NAMES: Record<DemoMode, string[]> = {
  seeded: [DEMO_LOCATION_SAMPLE, "Demo — Sample Data"],
  fresh: [DEMO_LOCATION_BLANK, "Demo — Blank Slate"],
};

export function demoLocationName(mode: DemoMode): string {
  return mode === "seeded" ? DEMO_LOCATION_SAMPLE : DEMO_LOCATION_BLANK;
}

async function seedWebsiteConnection(locationId: string) {
  await prisma.websiteConnection.upsert({
    where: { locationId },
    create: {
      locationId,
      url: "https://pinnaclerestaurant.com",
      connected: true,
      visitors30d: 4820,
      pageViews30d: 12450,
      sessions30d: 6180,
      bounceRate: 42.5,
      avgSessionSec: 118,
      topPages: JSON.stringify([
        { path: "/", views: 4730 },
        { path: "/menu", views: 2988 },
        { path: "/reservations", views: 1992 },
        { path: "/about", views: 1494 },
        { path: "/contact", views: 1245 },
      ]),
      referrers: JSON.stringify([
        { source: "Google Search", pct: 42 },
        { source: "Instagram", pct: 24 },
        { source: "Direct", pct: 18 },
        { source: "Facebook", pct: 9 },
        { source: "Other", pct: 5 },
      ]),
      lastSyncedAt: new Date(),
    },
    update: {
      url: "https://pinnaclerestaurant.com",
      connected: true,
      visitors30d: 4820,
      pageViews30d: 12450,
      sessions30d: 6180,
      bounceRate: 42.5,
      avgSessionSec: 118,
      lastSyncedAt: new Date(),
    },
  });
}

async function seedSocialAccounts(locationId: string) {
  const accounts = [
    {
      platform: "INSTAGRAM" as const,
      accountName: "@pinnaclerestaurant",
      profileUrl: "https://instagram.com/pinnaclerestaurant",
      followers: 4200,
    },
    {
      platform: "FACEBOOK" as const,
      accountName: "Pinnacle Restaurant",
      profileUrl: "https://facebook.com/pinnaclerestaurant",
      followers: 3100,
    },
    {
      platform: "TIKTOK" as const,
      accountName: "@pinnaclerestaurant",
      profileUrl: "https://tiktok.com/@pinnaclerestaurant",
      followers: 8900,
    },
    {
      platform: "X" as const,
      accountName: "@pinnaclerest",
      profileUrl: "https://x.com/pinnaclerest",
      followers: 1200,
    },
  ];

  for (const account of accounts) {
    await prisma.socialAccount.upsert({
      where: {
        locationId_platform: { locationId, platform: account.platform },
      },
      create: {
        locationId,
        ...account,
        connected: true,
        lastSyncedAt: new Date(),
      },
      update: {
        accountName: account.accountName,
        profileUrl: account.profileUrl,
        followers: account.followers,
        connected: true,
        lastSyncedAt: new Date(),
      },
    });
  }

  await seedWebsiteConnection(locationId);
}

export async function seedLocationData(locationId: string) {
  const existing = await prisma.menuItem.count({ where: { locationId } });
  if (existing > 0) {
    const socialCount = await prisma.socialAccount.count({ where: { locationId } });
    if (socialCount === 0) {
      await seedSocialAccounts(locationId);
    } else {
      const websiteCount = await prisma.websiteConnection.count({ where: { locationId } });
      if (websiteCount === 0) {
        await seedWebsiteConnection(locationId);
      }
    }
    const orderCount = await prisma.order.count({ where: { locationId } });
    if (orderCount < 5) {
      await import("@/lib/analytics/seed-sample").then((m) => m.seedAnalyticsSampleData(locationId));
    }
    return {
      message: "Already seeded for this location",
      locationId,
      alreadySeeded: true,
      partial: false,
    };
  }

  await prisma.menuItem.createMany({
    data: [
      { locationId, name: "Grilled Salmon", description: "Atlantic salmon with lemon butter", price: 28.99, category: "Entrees" },
      { locationId, name: "Caesar Salad", description: "Romaine, parmesan, croutons", price: 12.99, category: "Salads" },
      { locationId, name: "Margherita Pizza", description: "Fresh mozzarella, basil, tomato", price: 16.99, category: "Pizza" },
      { locationId, name: "Chocolate Lava Cake", description: "Warm cake with vanilla ice cream", price: 9.99, category: "Desserts" },
      { locationId, name: "House Red Wine", description: "Glass of Cabernet Sauvignon", price: 11.99, category: "Beverages" },
    ],
  });

  await prisma.inventoryItem.createMany({
    data: [
      { locationId, name: "Salmon fillets", quantity: 8, unit: "lbs", minQuantity: 10, costPerUnit: 12.5, previousCostPerUnit: 11.5, portionSize: 0.5, yieldPct: 92, supplier: "Ocean Fresh" },
      { locationId, name: "Romaine lettuce", quantity: 15, unit: "heads", minQuantity: 10, costPerUnit: 2.5, previousCostPerUnit: 2.3, portionSize: 0.25, yieldPct: 85, supplier: "Green Valley" },
      { locationId, name: "Mozzarella", quantity: 3, unit: "lbs", minQuantity: 5, costPerUnit: 6.0, previousCostPerUnit: 6.1, portionSize: 0.15, yieldPct: 98, supplier: "Dairy Direct" },
      { locationId, name: "Olive oil", quantity: 2, unit: "bottles", minQuantity: 3, costPerUnit: 15.0, portionSize: 0.02, yieldPct: 100, supplier: "Mediterranean Imports" },
      { locationId, name: "Flour", quantity: 20, unit: "lbs", minQuantity: 10, costPerUnit: 1.2, previousCostPerUnit: 1.1, portionSize: 0.5, yieldPct: 100, supplier: "Bulk Foods Co" },
    ],
  });

  await prisma.staffMember.createMany({
    data: [
      { locationId, name: "Maria Garcia", role: "Head Chef", email: "maria@pinnacle.com", hourlyRate: 28 },
      { locationId, name: "James Wilson", role: "Sous Chef", email: "james@pinnacle.com", hourlyRate: 22 },
      { locationId, name: "Sarah Chen", role: "Server", email: "sarah@pinnacle.com", hourlyRate: 15 },
      { locationId, name: "David Park", role: "Bartender", email: "david@pinnacle.com", hourlyRate: 18 },
    ],
  });

  await prisma.table.createMany({
    data: [
      { locationId, number: 1, capacity: 2, status: "available" },
      { locationId, number: 2, capacity: 4, status: "available" },
      { locationId, number: 3, capacity: 4, status: "occupied" },
      { locationId, number: 4, capacity: 6, status: "available" },
      { locationId, number: 5, capacity: 8, status: "reserved" },
    ],
  });

  await prisma.expense.createMany({
    data: [
      { locationId, description: "Weekly produce delivery", amount: 450, category: "Food & Supplies" },
      { locationId, description: "Electricity bill", amount: 320, category: "Utilities" },
      { locationId, description: "Equipment maintenance", amount: 180, category: "Maintenance" },
    ],
  });

  await seedSocialAccounts(locationId);
  await import("@/lib/analytics/seed-sample").then((m) => m.seedAnalyticsSampleData(locationId));

  return { message: "Seed data created successfully", locationId, alreadySeeded: false, partial: false };
}

export async function getOrCreateDemoLocation(mode: DemoMode) {
  const name = demoLocationName(mode);
  const existing = await prisma.location.findFirst({
    where: { name: { in: LEGACY_DEMO_NAMES[mode] } },
  });
  if (existing) {
    if (existing.name !== name) {
      return prisma.location.update({ where: { id: existing.id }, data: { name } });
    }
    return existing;
  }

  return prisma.location.create({
    data: {
      name,
      address: mode === "seeded" ? "123 Restaurant Row" : "Add your address",
    },
  });
}

export async function setupDemoWorkspace(mode: DemoMode) {
  const location = await getOrCreateDemoLocation(mode);
  let seedResult = null;

  if (mode === "seeded") {
    seedResult = await seedLocationData(location.id);
  }

  return {
    mode,
    locationId: location.id,
    locationName: location.name,
    seeded: mode === "seeded",
    seedResult,
  };
}
