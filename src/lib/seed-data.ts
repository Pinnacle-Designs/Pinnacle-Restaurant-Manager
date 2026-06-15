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

async function seedHiringSample(locationId: string) {
  const existing = await prisma.application.count({ where: { locationId } });
  if (existing > 0) return;

  const { generateOnboardingToken } = await import("@/lib/hiring/utils");

  await prisma.hiringSettings.upsert({
    where: { locationId },
    create: { locationId, applyKeyword: "APPLY", applyPhone: "+15551234567" },
    update: {},
  });

  const posting =
    (await prisma.jobPosting.findFirst({
      where: { locationId, applyCode: "DEMO1" },
    })) ??
    (await prisma.jobPosting.create({
      data: {
        locationId,
        title: "Server — evenings",
        role: "Server",
        applyCode: "DEMO1",
        active: true,
      },
    }));

  const pipeline = [
    { name: "Alex Rivera", phone: "+15559001001", status: "NEW" as const, role: "Server" },
    { name: "Jordan Lee", phone: "+15559001002", status: "INTERVIEW_SCHEDULED" as const, role: "Bartender" },
    { name: "Sam Ortiz", phone: "+15559001003", status: "OFFERED" as const, role: "Host" },
    { name: "Taylor Brooks", phone: "+15559001004", status: "HIRED" as const, role: "Server" },
  ];

  for (const row of pipeline) {
    const applicant = await prisma.applicant.upsert({
      where: { locationId_phone: { locationId, phone: row.phone } },
      create: {
        locationId,
        name: row.name,
        phone: row.phone,
        email: `${row.name.split(" ")[0].toLowerCase()}@example.com`,
      },
      update: { name: row.name },
    });

    const existingApp = await prisma.application.findFirst({
      where: { locationId, applicantId: applicant.id, role: row.role },
    });
    if (existingApp) continue;

    const application = await prisma.application.create({
      data: {
        locationId,
        applicantId: applicant.id,
        jobPostingId: posting.id,
        role: row.role,
        source: row.status === "NEW" ? "TEXT_APPLY" : "WEB",
        status: row.status,
        hiredAt: row.status === "HIRED" ? new Date() : null,
      },
    });

    if (row.status === "INTERVIEW_SCHEDULED") {
      await prisma.interview.create({
        data: {
          applicationId: application.id,
          scheduledAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
        },
      });
    }

    if (row.status === "HIRED") {
      await prisma.onboardingPacket.create({
        data: {
          locationId,
          applicationId: application.id,
          token: generateOnboardingToken(),
          status: "PENDING",
          documents: {
            create: ["I9", "W4", "DIRECT_DEPOSIT"].map((docType) => ({
              docType: docType as "I9" | "W4" | "DIRECT_DEPOSIT",
              data: "{}",
            })),
          },
        },
      });
    }
  }
}

async function seedTrainingSample(locationId: string) {
  const { ensureDefaultTrainingModules } = await import("@/lib/training/seed-modules");
  const { addMonths, subMonths } = await import("date-fns");
  await ensureDefaultTrainingModules(locationId);

  const staff = await prisma.staffMember.findMany({
    where: { locationId, active: true },
    take: 6,
  });
  if (staff.length === 0) return;

  const existingCerts = await prisma.staffCertification.count({ where: { locationId } });
  if (existingCerts > 0) return;

  const now = new Date();
  const samples: { staffIndex: number; certType: string; expiresAt: Date }[] = [
    { staffIndex: 0, certType: "servsafe_manager", expiresAt: addMonths(now, 8) },
    { staffIndex: 1, certType: "servsafe_food_handler", expiresAt: addMonths(now, 14) },
    { staffIndex: 2, certType: "food_handler_card", expiresAt: subMonths(now, 1) },
    { staffIndex: 3, certType: "tips_alcohol", expiresAt: addMonths(now, 3) },
    { staffIndex: 3, certType: "food_handler_card", expiresAt: addMonths(now, 20) },
  ];

  for (const row of samples) {
    const member = staff[row.staffIndex % staff.length];
    await prisma.staffCertification.create({
      data: {
        locationId,
        staffMemberId: member.id,
        certType: row.certType,
        issuer: "ServSafe / State",
        issuedAt: subMonths(row.expiresAt, 24),
        expiresAt: row.expiresAt,
      },
    });
  }
}

async function seedComplianceSample(locationId: string) {
  const { subYears, addDays } = await import("date-fns");
  const { getOrCreateComplianceSettings } = await import("@/lib/compliance/validate-shift");

  await getOrCreateComplianceSettings(locationId);

  let minor = await prisma.staffMember.findFirst({
    where: { locationId, name: "Jordan Kim (Minor)" },
  });
  if (!minor) {
    minor = await prisma.staffMember.create({
      data: {
        locationId,
        name: "Jordan Kim (Minor)",
        role: "Host",
        email: "jordan@example.com",
        dateOfBirth: subYears(new Date(), 17),
        hourlyRate: 12,
        active: true,
      },
    });
  }

  const shiftExists = await prisma.shift.findFirst({
    where: { locationId, staffMemberId: minor.id, notes: "DEMO_MINOR_VIOLATION" },
  });
  if (!shiftExists) {
    let day = new Date();
    for (let i = 0; i < 7; i++) {
      const d = addDays(day, i);
      const dow = d.getDay();
      if (dow >= 0 && dow <= 4) {
        day = d;
        break;
      }
    }
    day.setHours(12, 0, 0, 0);
    await prisma.shift.create({
      data: {
        locationId,
        staffMemberId: minor.id,
        date: day,
        startTime: "16:00",
        endTime: "23:00",
        workRole: "Host",
        notes: "DEMO_MINOR_VIOLATION",
      },
    });
  }

  const incidentCount = await prisma.incidentReport.count({ where: { locationId } });
  if (incidentCount === 0) {
    const cook = await prisma.staffMember.findFirst({
      where: { locationId, role: { contains: "Cook" } },
    });
    await prisma.incidentReport.create({
      data: {
        locationId,
        incidentType: "WORKPLACE_INJURY",
        category: "burn",
        description: "Minor grease splash on forearm during lunch rush — treated with burn gel, returned to station.",
        staffMemberId: cook?.id,
        severity: "LOW",
        oshaRecordable: false,
        actionTaken: "First aid applied; non-recordable per OSHA guidance.",
        reportedByName: "Demo Manager",
      },
    });
  }
}

async function seedRetentionSample(locationId: string) {
  const { subMonths, subDays } = await import("date-fns");

  let former = await prisma.staffMember.findFirst({
    where: { locationId, name: "Chris Alvarez (Former)" },
  });
  if (!former) {
    former = await prisma.staffMember.create({
      data: {
        locationId,
        name: "Chris Alvarez (Former)",
        role: "Server",
        email: "chris.former@example.com",
        hourlyRate: 14,
        active: false,
        hireDate: subMonths(new Date(), 8),
        terminatedAt: subMonths(new Date(), 1),
        terminationReason: "Voluntary — schedule conflict",
      },
    });

    for (let i = 0; i < 12; i++) {
      const day = subDays(subMonths(new Date(), 1), i * 3);
      day.setHours(12, 0, 0, 0);
      await prisma.shift.create({
        data: {
          locationId,
          staffMemberId: former.id,
          date: day,
          startTime: "17:00",
          endTime: "23:00",
          workRole: "Server",
        },
      });
    }
  }

  let formerHost = await prisma.staffMember.findFirst({
    where: { locationId, name: "Morgan Lee (Former)" },
  });
  if (!formerHost) {
    formerHost = await prisma.staffMember.create({
      data: {
        locationId,
        name: "Morgan Lee (Former)",
        role: "Host",
        hourlyRate: 13,
        active: false,
        hireDate: subMonths(new Date(), 5),
        terminatedAt: subMonths(new Date(), 2),
        terminationReason: "Better opportunity elsewhere",
      },
    });
  }

  const feedbackCount = await prisma.shiftFeedback.count({ where: { locationId } });
  if (feedbackCount === 0) {
    const sarah = await prisma.staffMember.findFirst({
      where: { locationId, name: { contains: "Sarah" } },
    });
    const maria = await prisma.staffMember.findFirst({
      where: { locationId, role: { contains: "Chef" } },
    });
    if (sarah) {
      await prisma.shiftFeedback.create({
        data: {
          locationId,
          staffMemberId: sarah.id,
          authorName: "Demo Manager",
          kind: "SHOUT_OUT",
          content: "Handled a 12-top flawlessly during Friday rush — guests asked for her by name.",
        },
      });
    }
    if (maria) {
      await prisma.shiftFeedback.create({
        data: {
          locationId,
          staffMemberId: maria.id,
          authorName: "Demo Manager",
          kind: "NOTE",
          content: "Strong expo communication during brunch; consider for lead cook training.",
        },
      });
    }
  }
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
    await seedHiringSample(locationId);
    await seedTrainingSample(locationId);
    await seedComplianceSample(locationId);
    await seedRetentionSample(locationId);
    await import("@/lib/pos/seed-pos").then((m) => m.seedPosSample(locationId));
    await import("@/lib/menu/seed-boh").then((m) => m.seedBohSample(locationId));
    await import("@/lib/kitchen/seed-kitchen").then((m) => m.seedKitchenSample(locationId));
    await import("@/lib/menu/seed-recipes").then((m) => m.seedMenuRecipes(locationId));
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
      { locationId, name: "Chicken breast", quantity: 6, unit: "lbs", minQuantity: 12, costPerUnit: 4.5, previousCostPerUnit: 4.2, portionSize: 0.4, yieldPct: 90, supplier: "Farm Fresh Poultry" },
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
  await seedHiringSample(locationId);
  await seedTrainingSample(locationId);
  await seedComplianceSample(locationId);
  await seedRetentionSample(locationId);
  await import("@/lib/pos/seed-pos").then((m) => m.seedPosSample(locationId));
  await import("@/lib/menu/seed-boh").then((m) => m.seedBohSample(locationId));
  await import("@/lib/kitchen/seed-kitchen").then((m) => m.seedKitchenSample(locationId));
  await import("@/lib/menu/seed-recipes").then((m) => m.seedMenuRecipes(locationId));

  return { message: "Seed data created successfully", locationId, alreadySeeded: false, partial: false };
}

export async function getOrCreateDemoLocation(mode: DemoMode) {
  const name = demoLocationName(mode);
  const existing = await prisma.location.findFirst({
    where: { name: { in: LEGACY_DEMO_NAMES[mode] } },
  });
  if (existing) {
    if (existing.name !== name) {
      return prisma.location.update({
        where: { id: existing.id },
        data: { name, plan: "PRO" },
      });
    }
    if (existing.plan !== "PRO") {
      return prisma.location.update({
        where: { id: existing.id },
        data: { plan: "PRO" },
      });
    }
    return existing;
  }

  return prisma.location.create({
    data: {
      name,
      address: mode === "seeded" ? "123 Restaurant Row" : "Add your address",
      plan: "PRO",
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
    plan: location.plan,
    seeded: mode === "seeded",
    seedResult,
  };
}
