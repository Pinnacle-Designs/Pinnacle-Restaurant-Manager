import { prisma } from "./prisma";
import { BBQ_INVENTORY_CATALOG } from "./menu/bbq-catalog";

export type DemoMode = "seeded" | "fresh";

export const DEMO_LOCATION_SAMPLE = "Smoky Oak BBQ";
export const DEMO_LOCATION_BLANK = "Demo - Blank Slate";

/** Legacy names before rebrand / ASCII hyphen fix */
const LEGACY_DEMO_NAMES: Record<DemoMode, string[]> = {
  seeded: [DEMO_LOCATION_SAMPLE, "Demo - Sample Data", "Demo — Sample Data"],
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
      url: "https://smokyoakbbq.com",
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
      url: "https://smokyoakbbq.com",
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
        title: "Server — smokehouse floor",
        role: "Server",
        applyCode: "DEMO1",
        active: true,
      },
    }));

  const pipeline = [
    { name: "Miguel Santos", phone: "+15559001001", status: "NEW" as const, role: "Server" },
    { name: "Rebecca Huang", phone: "+15559001002", status: "INTERVIEW_SCHEDULED" as const, role: "Bartender" },
    { name: "Devon Price", phone: "+15559001003", status: "OFFERED" as const, role: "Host" },
    { name: "Aisha Coleman", phone: "+15559001004", status: "HIRED" as const, role: "Line Cook" },
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
        description:
          "Minor steam burn on wrist while pulling pork shoulder from the holding warmer — treated with burn gel, returned to line.",
        staffMemberId: cook?.id,
        severity: "LOW",
        oshaRecordable: false,
        actionTaken: "First aid applied; smoker gloves reissued. Non-recordable per OSHA guidance.",
        reportedByName: "Elena Vasquez",
      },
    });
  }
}

async function seedRetentionSample(locationId: string) {
  const { subMonths, subDays } = await import("date-fns");

  let former = await prisma.staffMember.findFirst({
    where: { locationId, name: "Noah Pierce (Former)" },
  });
  if (!former) {
    former = await prisma.staffMember.create({
      data: {
        locationId,
        name: "Noah Pierce (Former)",
        role: "Server",
        email: "noah.former@example.com",
        hourlyRate: 14,
        active: false,
        hireDate: subMonths(new Date(), 8),
        terminatedAt: subMonths(new Date(), 1),
        terminationReason: "Voluntary — moved out of town",
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
    const priya = await prisma.staffMember.findFirst({
      where: { locationId, name: { contains: "Priya" } },
    });
    const marcus = await prisma.staffMember.findFirst({
      where: { locationId, role: { contains: "Pitmaster" } },
    });
    if (priya) {
      await prisma.shiftFeedback.create({
        data: {
          locationId,
          staffMemberId: priya.id,
          authorName: "Marcus Reed",
          kind: "SHOUT_OUT",
          content: "Handled a 10-top family reunion during Saturday lunch rush — comps and refires were flawless.",
        },
      });
    }
    if (marcus) {
      await prisma.shiftFeedback.create({
        data: {
          locationId,
          staffMemberId: marcus.id,
          authorName: "Elena Vasquez",
          kind: "NOTE",
          content: "Brisket batch held perfectly through dinner service; consider training line cooks on his rest-and-hold routine.",
        },
      });
    }
  }
}

async function seedSocialAccounts(locationId: string) {
  const accounts = [
    {
      platform: "INSTAGRAM" as const,
      accountName: "@smokyoakbbq",
      profileUrl: "https://instagram.com/smokyoakbbq",
      followers: 6200,
    },
    {
      platform: "FACEBOOK" as const,
      accountName: "Smoky Oak BBQ",
      profileUrl: "https://facebook.com/smokyoakbbq",
      followers: 4800,
    },
    {
      platform: "TIKTOK" as const,
      accountName: "@smokyoakbbq",
      profileUrl: "https://tiktok.com/@smokyoakbbq",
      followers: 12400,
    },
    {
      platform: "X" as const,
      accountName: "@smokyoakbbq",
      profileUrl: "https://x.com/smokyoakbbq",
      followers: 2100,
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
    await import("@/lib/seed-extras").then((m) => m.seedDemoExtras(locationId));
    return {
      message: "Already seeded for this location",
      locationId,
      alreadySeeded: true,
      partial: false,
    };
  }

  await prisma.menuItem.createMany({
    data: [
      {
        locationId,
        name: "Smoked Brisket Plate",
        description: "Sliced USDA Choice brisket with two sides",
        price: 24.99,
        category: "Smoked Meats",
        salesCategory: "FOOD",
        posGridIndex: 0,
      },
      {
        locationId,
        name: "St. Louis Ribs (Half Rack)",
        description: "Dry-rubbed, oak-smoked, house glaze",
        price: 22.99,
        category: "Smoked Meats",
        salesCategory: "FOOD",
        posGridIndex: 1,
      },
      {
        locationId,
        name: "Pulled Pork Sandwich",
        description: "Chopped shoulder, pickles, slaw on brioche",
        price: 14.99,
        category: "Sandwiches",
        salesCategory: "FOOD",
        posGridIndex: 2,
      },
      {
        locationId,
        name: "Smoked Chicken Quarter",
        description: "Quarter bird with Alabama white sauce",
        price: 16.99,
        category: "Smoked Meats",
        salesCategory: "FOOD",
        posGridIndex: 3,
      },
      {
        locationId,
        name: "Mac & Cheese",
        description: "Three-cheese baked side",
        price: 5.99,
        category: "Sides",
        salesCategory: "FOOD",
        posGridIndex: 10,
      },
      {
        locationId,
        name: "Coleslaw",
        description: "Creamy vinegar slaw",
        price: 4.99,
        category: "Sides",
        salesCategory: "FOOD",
        posGridIndex: 11,
      },
      {
        locationId,
        name: "Sweet Tea",
        description: "House-brewed, refills included",
        price: 3.49,
        category: "Beverages",
        salesCategory: "NA_BEVERAGE",
        posGridIndex: 20,
      },
      {
        locationId,
        name: "Peach Cobbler",
        description: "Warm cobbler with vanilla ice cream",
        price: 7.99,
        category: "Desserts",
        salesCategory: "FOOD",
        posGridIndex: 30,
      },
    ],
  });

  await prisma.inventoryItem.createMany({
    data: BBQ_INVENTORY_CATALOG.map((item) => ({
      locationId,
      name: item.name,
      quantity: item.quantity,
      unit: item.unit,
      minQuantity: item.minQuantity,
      costPerUnit: item.costPerUnit,
      previousCostPerUnit: item.previousCostPerUnit,
      portionSize: item.portionSize,
      yieldPct: item.yieldPct ?? 100,
      supplier: item.supplier,
      barcode: item.barcode ?? null,
    })),
  });

  await prisma.staffMember.createMany({
    data: [
      { locationId, name: "Marcus Reed", role: "Pitmaster", email: "marcus@smokyoakbbq.com", hourlyRate: 28 },
      { locationId, name: "Elena Vasquez", role: "Line Cook", email: "elena@smokyoakbbq.com", hourlyRate: 19 },
      { locationId, name: "Priya Nair", role: "Server", email: "priya@smokyoakbbq.com", hourlyRate: 12 },
      { locationId, name: "David Park", role: "Bartender", email: "david@smokyoakbbq.com", hourlyRate: 16 },
      { locationId, name: "Riley Brooks", role: "Host", email: "riley@smokyoakbbq.com", hourlyRate: 13 },
    ],
  });

  await prisma.table.createMany({
    data: [
      { locationId, number: 1, capacity: 2, status: "available" },
      { locationId, number: 2, capacity: 2, status: "occupied" },
      { locationId, number: 3, capacity: 4, status: "available" },
      { locationId, number: 4, capacity: 4, status: "occupied" },
      { locationId, number: 5, capacity: 4, status: "available" },
      { locationId, number: 6, capacity: 6, status: "reserved" },
      { locationId, number: 7, capacity: 6, status: "available" },
      { locationId, number: 8, capacity: 6, status: "available" },
      { locationId, number: 9, capacity: 8, status: "occupied" },
      { locationId, number: 10, capacity: 8, status: "available" },
      { locationId, number: 11, capacity: 4, status: "available" },
      { locationId, number: 12, capacity: 4, status: "available" },
    ],
  });

  await prisma.expense.createMany({
    data: [
      { locationId, description: "Oak wood & charcoal delivery", amount: 680, category: "Food & Supplies" },
      { locationId, description: "Brisket & rib vendor invoice", amount: 2140, category: "Food & Supplies" },
      { locationId, description: "Smoker maintenance & thermometers", amount: 420, category: "Maintenance" },
      { locationId, description: "Electricity — walk-in & smokers", amount: 890, category: "Utilities" },
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
  await import("@/lib/seed-extras").then((m) => m.seedDemoExtras(locationId));

  return { message: "Seed data created successfully", locationId, alreadySeeded: false, partial: false };
}

export async function getOrCreateDemoLocation(mode: DemoMode) {
  const name = demoLocationName(mode);
  const existing = await prisma.location.findFirst({
    where: { name: { in: LEGACY_DEMO_NAMES[mode] } },
  });
  if (existing) {
    const seededMeta =
      mode === "seeded"
        ? {
            name,
            plan: "PRO" as const,
            address: "1847 Oak Lane, Austin, TX 78701",
            phone: "(512) 555-0147",
            seatCount: 76,
          }
        : { name, plan: "PRO" as const };

    if (existing.name !== name || mode === "seeded") {
      return prisma.location.update({
        where: { id: existing.id },
        data: seededMeta,
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
      address: mode === "seeded" ? "1847 Oak Lane, Austin, TX 78701" : "Add your address",
      phone: mode === "seeded" ? "(512) 555-0147" : undefined,
      seatCount: mode === "seeded" ? 76 : undefined,
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
