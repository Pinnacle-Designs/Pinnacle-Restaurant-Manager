/**
 * Supplemental demo seed — fills every major app surface (dashboard, POS/KDS, social,
 * payroll, training, photos, insights, menu channels, etc.) for Smoky Oak BBQ.
 */
import { prisma } from "./prisma";
import { subDays, subHours, addDays, addHours, startOfWeek, startOfDay, format } from "date-fns";
import { ensureMenuChannelConfigs } from "./menu/publish";
import { ensureKitchenStations } from "./kitchen/stations";
import { getOrCreatePayrollSettings } from "./payroll/load-context";
import { hashClockPin } from "./timeclock/clock-pin";

const LIVE_ORDER_MARKER = "DEMO_LIVE_SERVICE";

export async function seedDemoExtras(locationId: string) {
  await seedLocationProfile(locationId);
  await seedStaffFlags(locationId);
  await seedMenuChannels(locationId);
  await seedPaymentProviders(locationId);
  await enrichPaidOrders(locationId);
  await seedLiveServiceOrders(locationId);
  await seedBohSignals(locationId);
  await seedBusinessInsights(locationId);
  await seedActivityLog(locationId);
  await seedPhotos(locationId);
  await seedSocialPosts(locationId);
  await seedHiringSms(locationId);
  await seedTrainingCompletions(locationId);
  await seedStaffClockPins(locationId);
  await seedStaffMultiRoleRates(locationId);
  await seedForgottenClockOutDemo(locationId);
  await seedComplianceLaborDemo(locationId);
  await seedTimeEntries(locationId);
  await seedShiftSwap(locationId);
  await seedPayrollSamples(locationId);
  await import("./integrations/seed-integrations").then((m) => m.seedIntegrationsSample(locationId));
  await import("./purchasing/seed-purchasing").then((m) => m.seedPurchasingSample(locationId));
  await import("./walk-in/seed-walk-in").then((m) => m.seedWalkInSample(locationId));
  await import("./kitchen/seed-kitchen").then((m) => m.seedKitchenSample(locationId));
  await import("./back-office/seed-back-office").then((m) => m.seedBackOfficeSample(locationId));
  await import("./crystal-ball/seed-crystal-ball").then((m) => m.seedCrystalBallSample(locationId));
  await import("./tables/seed-floor-plan").then((m) => m.seedFloorPlanAndReservations(locationId));
}

async function seedLocationProfile(locationId: string) {
  await prisma.location.update({
    where: { id: locationId },
    data: {
      setupComplete: true,
      onboardingStep: 4,
      seatCount: 76,
      squareFootage: 3200,
      latitude: 30.2672,
      longitude: -97.7431,
      geoFenceRadiusM: 150,
      geoClockInRequired: true,
      punchPhotoRequired: true,
      punchVerificationMode: "PHOTO_OR_BIOMETRIC",
      earlyClockInBufferMins: 15,
      blockUnscheduledPunch: false,
      targetLaborPct: 28,
      autopayEnabled: true,
      billingEmail: "marcus@smokyoakbbq.com",
      paymentBrand: "Visa",
      paymentLast4: "4242",
      paymentExpMonth: 8,
      paymentExpYear: 2028,
      nextBillingDate: addDays(new Date(), 18),
      plan: "PRO",
    },
  });
}

async function seedStaffFlags(locationId: string) {
  const tippedRoles = ["Server", "Bartender", "Host"];
  const staff = await prisma.staffMember.findMany({ where: { locationId, active: true } });
  for (const member of staff) {
    const tipped = tippedRoles.some((r) => member.role.includes(r));
    if (member.isTippedEmployee !== tipped || (tipped && member.tipPoints < 1)) {
      await prisma.staffMember.update({
        where: { id: member.id },
        data: {
          isTippedEmployee: tipped,
          tipPoints: tipped ? (member.role.includes("Server") ? 1.2 : 1) : 0,
          hireDate: member.hireDate ?? subDays(new Date(), 180),
        },
      });
    }
  }
}

async function seedMenuChannels(locationId: string) {
  await ensureMenuChannelConfigs(locationId);
  const syncedAt = subHours(new Date(), 2);
  const channels = await prisma.menuChannelConfig.findMany({ where: { locationId } });
  for (const cfg of channels) {
    if (cfg.lastSyncedAt) continue;
    const delivery = ["DOORDASH", "UBER_EATS", "GRUBHUB"].includes(cfg.channel);
    await prisma.menuChannelConfig.update({
      where: { id: cfg.id },
      data: {
        enabled: true,
        lastSyncedAt: syncedAt,
        lastSyncStatus: "ok",
        lastSyncMessage: delivery
          ? `16 items published (+${cfg.priceMarkupPct}% markup)`
          : "16 items synced from menu revision",
        externalStoreId: delivery ? `smoky-oak-${cfg.channel.toLowerCase()}` : null,
      },
    });
  }
}

async function seedPaymentProviders(locationId: string) {
  await prisma.paymentProviderConnection.upsert({
    where: { locationId_purpose: { locationId, purpose: "SUBSCRIPTION" } },
    create: {
      locationId,
      provider: "MANUAL",
      purpose: "SUBSCRIPTION",
      status: "connected",
      metadata: JSON.stringify({ demo: true, label: "Visa •••• 4242" }),
    },
    update: { status: "connected" },
  });

  await prisma.paymentProviderConnection.upsert({
    where: { locationId_purpose: { locationId, purpose: "POS" } },
    create: {
      locationId,
      provider: "SQUARE",
      purpose: "POS",
      status: "demo",
      accountId: "sq0demo-smoky-oak",
      metadata: JSON.stringify({ demo: true, sandbox: true, stripeConnectAvailable: true }),
    },
    update: {
      provider: "SQUARE",
      status: "demo",
      metadata: JSON.stringify({ demo: true, sandbox: true, stripeConnectAvailable: true }),
    },
  });
}

async function enrichPaidOrders(locationId: string) {
  const needsPayment = await prisma.order.findMany({
    where: {
      locationId,
      status: "PAID",
      paidAt: null,
    },
    take: 120,
    orderBy: { createdAt: "desc" },
  });
  if (needsPayment.length === 0) return;

  const servers = await prisma.staffMember.findMany({
    where: { locationId, active: true, isTippedEmployee: true },
  });
  if (servers.length === 0) return;

  for (const order of needsPayment) {
    const server = servers[Math.floor(Math.random() * servers.length)]!;
    const paidAt = order.createdAt;
    const tip = Math.round(order.totalAmount * (0.12 + Math.random() * 0.08) * 100) / 100;

    await prisma.order.update({
      where: { id: order.id },
      data: {
        paidAt,
        serverStaffId: server.id,
        checkStatus: "CLOSED",
      },
    });

    const existingPayment = await prisma.orderPayment.count({ where: { orderId: order.id } });
    if (existingPayment === 0) {
      await prisma.orderPayment.create({
        data: {
          orderId: order.id,
          method: Math.random() > 0.35 ? "CARD" : "CASH",
          amount: order.totalAmount,
          tipAmount: tip,
        },
      });
    }
  }
}

async function seedLiveServiceOrders(locationId: string) {
  const existing = await prisma.order.count({
    where: { locationId, notes: LIVE_ORDER_MARKER },
  });
  if (existing > 0) return;

  const [tables, items, stations, priya, david] = await Promise.all([
    prisma.table.findMany({ where: { locationId }, orderBy: { number: "asc" } }),
    prisma.menuItem.findMany({ where: { locationId } }),
    ensureKitchenStations(locationId),
    prisma.staffMember.findFirst({ where: { locationId, name: { contains: "Priya" } } }),
    prisma.staffMember.findFirst({ where: { locationId, name: { contains: "David" } } }),
  ]);

  const byName = Object.fromEntries(items.map((i) => [i.name, i]));
  const bySlug = Object.fromEntries(stations.map((s) => [s.slug, s]));
  const table = (n: number) => tables.find((t) => t.number === n);
  const stationId = (slug: string) => bySlug[slug]?.id ?? null;

  const brisket = byName["Smoked Brisket Plate"];
  const pork = byName["Pulled Pork Sandwich"];
  const ribs = byName["St. Louis Ribs (Half Rack)"];
  const tea = byName["Sweet Tea"];
  const poppers = byName["Jalapeño Poppers"];
  const beer = byName["Draft Beer"];
  const beans = byName["Baked Beans"];

  if (brisket && tea && table(2)) {
    await prisma.order.create({
      data: {
        locationId,
        tableId: table(2)!.id,
        serverStaffId: priya?.id,
        status: "PREPARING",
        checkStatus: "OPEN",
        totalAmount: brisket.price + tea.price + (poppers?.price ?? 0),
        guestCount: 4,
        channel: "dine-in",
        partyName: "Henderson",
        notes: LIVE_ORDER_MARKER,
        items: {
          create: [
            {
              menuItemId: brisket.id,
              quantity: 2,
              price: brisket.price,
              seatNumber: 1,
              kitchenStationId: stationId("smoker"),
              kitchenStatus: "FIRED",
              firedAt: subMinutes(12),
              modifierSummary: "Sweet Texas, Mac & Cheese + Coleslaw",
              course: "MAIN",
            },
            {
              menuItemId: tea.id,
              quantity: 2,
              price: tea.price,
              seatNumber: 1,
              kitchenStationId: stationId("service-bar"),
              kitchenStatus: "FIRED",
              firedAt: subMinutes(10),
              course: "BEVERAGE",
            },
            ...(poppers
              ? [
                  {
                    menuItemId: poppers.id,
                    quantity: 1,
                    price: poppers.price,
                    seatNumber: 2,
                    kitchenStationId: stationId("fry"),
                    kitchenStatus: "PENDING",
                    course: "APP",
                  },
                ]
              : []),
          ],
        },
      },
    });
  }

  if (pork && ribs && beer && table(4)) {
    const order = await prisma.order.create({
      data: {
        locationId,
        tableId: table(4)!.id,
        serverStaffId: priya?.id,
        status: "PREPARING",
        checkStatus: "OPEN",
        totalAmount: pork.price + ribs.price + beer.price,
        guestCount: 2,
        channel: "dine-in",
        notes: LIVE_ORDER_MARKER,
        items: {
          create: [
            {
              menuItemId: pork.id,
              quantity: 1,
              price: pork.price,
              seatNumber: 1,
              kitchenStationId: stationId("cold"),
              kitchenStatus: "FIRED",
              firedAt: subMinutes(8),
              course: "MAIN",
            },
            {
              menuItemId: ribs.id,
              quantity: 1,
              price: ribs.price,
              seatNumber: 2,
              kitchenStationId: stationId("smoker"),
              kitchenStatus: "FIRED",
              firedAt: subMinutes(6),
              course: "MAIN",
            },
            {
              menuItemId: beer.id,
              quantity: 1,
              price: beer.price,
              seatNumber: 2,
              kitchenStationId: stationId("service-bar"),
              kitchenStatus: "FIRED",
              firedAt: subMinutes(5),
              course: "BEVERAGE",
            },
          ],
        },
      },
      include: { items: true },
    });

    const check1 = await prisma.orderCheck.create({
      data: { orderId: order.id, label: "Seat 1", seatNumber: 1 },
    });
    const check2 = await prisma.orderCheck.create({
      data: { orderId: order.id, label: "Seat 2", seatNumber: 2 },
    });
    for (const line of order.items) {
      await prisma.orderItem.update({
        where: { id: line.id },
        data: { checkId: line.seatNumber === 1 ? check1.id : check2.id },
      });
    }
  }

  if (brisket && beans && table(9)) {
    const order = await prisma.order.create({
      data: {
        locationId,
        tableId: table(9)!.id,
        serverStaffId: david?.id ?? priya?.id,
        status: "SERVED",
        checkStatus: "PARTIALLY_PAID",
        totalAmount: brisket.price + beans.price,
        guestCount: 6,
        channel: "dine-in",
        partyName: "Austin Tech Meetup",
        notes: LIVE_ORDER_MARKER,
        items: {
          create: [
            {
              menuItemId: brisket.id,
              quantity: 3,
              price: brisket.price,
              kitchenStationId: stationId("smoker"),
              kitchenStatus: "DONE",
              firedAt: subMinutes(45),
              course: "MAIN",
            },
            ...(beans
              ? [
                  {
                    menuItemId: beans.id,
                    quantity: 2,
                    price: beans.price,
                    kitchenStationId: stationId("fry"),
                    kitchenStatus: "DONE",
                    firedAt: subMinutes(40),
                    course: "MAIN",
                  },
                ]
              : []),
          ],
        },
      },
    });

    const check = await prisma.orderCheck.create({
      data: { orderId: order.id, label: "Check 1", isClosed: false },
    });
    await prisma.orderPayment.create({
      data: {
        orderId: order.id,
        checkId: check.id,
        method: "CARD",
        amount: brisket.price * 2,
        tipAmount: 18,
      },
    });
  }
}

function subMinutes(mins: number) {
  return subHours(new Date(), mins / 60);
}

async function seedBohSignals(locationId: string) {
  const burntEnds = await prisma.menuItem.findFirst({
    where: { locationId, name: "Burnt Ends" },
  });
  if (burntEnds && burntEnds.stockCount === null) {
    await prisma.menuItem.update({
      where: { id: burntEnds.id },
      data: { stockCount: 6 },
    });
  }

  const poppers = await prisma.menuItem.findFirst({
    where: { locationId, name: "Jalapeño Poppers" },
  });
  if (poppers && !poppers.eightySixedAt) {
    await prisma.menuItem.update({
      where: { id: poppers.id },
      data: { eightySixedAt: subHours(new Date(), 1), available: false },
    });
  }

  const brisketInv = await prisma.inventoryItem.findFirst({
    where: { locationId, name: "Beef brisket" },
  });
  if (brisketInv && brisketInv.quantity > brisketInv.minQuantity) {
    await prisma.inventoryItem.update({
      where: { id: brisketInv.id },
      data: { quantity: Math.max(brisketInv.minQuantity - 4, 8) },
    });
  }
}

async function seedBusinessInsights(locationId: string) {
  const count = await prisma.businessInsight.count({ where: { locationId } });
  if (count > 0) return;

  await prisma.businessInsight.createMany({
    data: [
      {
        locationId,
        title: "Brisket food cost up 6.8% — Hill Country Meats",
        description:
          "Vendor invoice shows brisket at $6.80/lb vs $6.40 last month. The Smoked Brisket Plate margin dropped 2.1 points.",
        category: "FINANCE",
        severity: "HIGH",
        actionable: "Renegotiate brisket contract or raise plate price $1.50 before summer.",
      },
      {
        locationId,
        title: "Beef brisket below par — reorder today",
        description: "On-hand brisket is 8 lbs vs 30 lb par. Risk of 86 on brisket plates by Saturday lunch.",
        category: "INVENTORY",
        severity: "CRITICAL",
        actionable: "Place emergency order with Hill Country Meats or pull burnt ends as special only.",
      },
      {
        locationId,
        title: "Friday burnt ends sell out before 7pm",
        description:
          "Guest review last week cited sold-out burnt ends. Stock countdown hit zero during dinner 2 of last 4 Fridays.",
        category: "MENU",
        severity: "MEDIUM",
        actionable: "Increase Friday burnt ends batch or cap QR pre-orders after 6:30pm.",
      },
      {
        locationId,
        title: "Rib Night Instagram drove $5.1k attributed sales",
        description: "Campaign ROI 5.5× — highest performing channel this month vs Google BBQ near me at 5.1×.",
        category: "OPERATIONS",
        severity: "LOW",
        actionable: "Repeat Rib Night creative next week; boost catering CTA in caption.",
      },
      {
        locationId,
        title: "Jordan Kim — minor labor rule conflict Saturday",
        description: "Scheduled Host shift ends 11pm on a school night — exceeds 10pm minor cutoff.",
        category: "STAFFING",
        severity: "HIGH",
        actionable: "Move Jordan to Sunday brunch or swap with Riley Brooks on compliance schedule.",
      },
    ],
  });
}

async function seedActivityLog(locationId: string) {
  const count = await prisma.activityLog.count({ where: { locationId } });
  if (count >= 5) return;

  const now = new Date();
  await prisma.activityLog.createMany({
    data: [
      {
        locationId,
        action: "SYNC",
        entity: "menu_channel",
        details: "Synced 16 items to DoorDash (+15% markup)",
        createdAt: subHours(now, 2),
      },
      {
        locationId,
        action: "CREATE",
        entity: "order",
        details: "New order: $47.97 — Table 2",
        createdAt: subHours(now, 3),
      },
      {
        locationId,
        action: "UPDATE",
        entity: "inventory",
        details: "Received 40 lbs beef brisket from Hill Country Meats",
        createdAt: subDays(now, 1),
      },
      {
        locationId,
        action: "PUBLISH",
        entity: "social_post",
        details: "Published Rib Night reel to Instagram + TikTok",
        createdAt: subDays(now, 2),
      },
      {
        locationId,
        action: "CREATE",
        entity: "expense",
        details: "Expense logged: Oak wood & charcoal — $680",
        createdAt: subDays(now, 3),
      },
      {
        locationId,
        action: "ALERT",
        entity: "insight",
        details: "Critical: Beef brisket below par level",
        createdAt: subDays(now, 4),
      },
      {
        locationId,
        action: "CLOCK_IN",
        entity: "time_entry",
        details: "Elena Vasquez clocked in — Line Cook",
        createdAt: subHours(now, 5),
      },
      {
        locationId,
        action: "APPLICATION",
        entity: "hiring",
        details: "New text-to-apply: Miguel Santos — Server",
        createdAt: subDays(now, 5),
      },
    ],
  });
}

async function seedPhotos(locationId: string) {
  const count = await prisma.photo.count({ where: { locationId } });
  if (count > 0) return;

  const brisket = await prisma.menuItem.findFirst({
    where: { locationId, name: "Smoked Brisket Plate" },
  });

  await prisma.photo.createMany({
    data: [
      {
        locationId,
        filename: "brisket-plate-demo.jpg",
        url: "/logo.png",
        category: "MENU_ITEM",
        title: "Smoked Brisket Plate — money shot",
        description: "Sliced brisket with mac, slaw, and Texas toast",
        aiAnalysis: JSON.stringify({
          category: "MENU_ITEM",
          items: ["brisket", "mac and cheese", "coleslaw"],
          quality: "high",
          lighting: "warm smokehouse",
        }),
        entityType: brisket ? "menuItem" : null,
        entityId: brisket?.id,
      },
      {
        locationId,
        filename: "smoker-pit.jpg",
        url: "/logo.png",
        category: "FACILITY",
        title: "Oak smoker pit line",
        description: "Double-stack offset smokers on the back patio",
        aiAnalysis: JSON.stringify({ category: "FACILITY", equipment: ["offset smoker", "wood rack"] }),
      },
      {
        locationId,
        filename: "brisket-receive.jpg",
        url: "/logo.png",
        category: "INVENTORY",
        title: "Brisket delivery — Hill Country Meats",
        description: "40 lb case logged via barcode receive",
      },
      {
        locationId,
        filename: "receipt-wood.jpg",
        url: "/logo.png",
        category: "RECEIPT",
        title: "Texas Fuel & Wood invoice",
        description: "Oak smoking wood — $660",
        aiAnalysis: JSON.stringify({
          vendor: "Texas Fuel & Wood",
          amount: 660,
          category: "Food & Supplies",
        }),
      },
      {
        locationId,
        filename: "pit-crew.jpg",
        url: "/logo.png",
        category: "STAFF",
        title: "Pit crew pre-shift",
        description: "Marcus and Elena prepping smokers for lunch service",
      },
      {
        locationId,
        filename: "rib-night-promo.jpg",
        url: "/logo.png",
        category: "MARKETING",
        title: "Rib Night Instagram creative",
        description: "Half-rack glaze close-up for social campaign",
      },
      {
        locationId,
        filename: "prep-line.jpg",
        url: "/logo.png",
        category: "FOOD_PREP",
        title: "Pulled pork hold pan",
        description: "Shoulder pull at 195°F internal",
      },
    ],
  });
}

async function seedSocialPosts(locationId: string) {
  const count = await prisma.socialPost.count({ where: { locationId } });
  if (count > 0) return;

  const accounts = await prisma.socialAccount.findMany({
    where: { locationId, connected: true },
  });
  const ig = accounts.find((a) => a.platform === "INSTAGRAM");
  const tiktok = accounts.find((a) => a.platform === "TIKTOK");
  const fb = accounts.find((a) => a.platform === "FACEBOOK");

  const published = await prisma.socialPost.create({
    data: {
      locationId,
      content:
        "🔥 Rib Night is ON — half-rack St. Louis ribs, house glaze, live blues on the patio. Walk-ins welcome after 5pm. #SmokyOakBBQ #AustinEats",
      status: "PUBLISHED",
      publishedAt: subDays(new Date(), 3),
      targets: {
        create: [
          ...(ig ? [{ accountId: ig.id, status: "PUBLISHED" as const, publishedAt: subDays(new Date(), 3) }] : []),
          ...(fb ? [{ accountId: fb.id, status: "PUBLISHED" as const, publishedAt: subDays(new Date(), 3) }] : []),
        ],
      },
    },
  });

  await prisma.socialPost.create({
    data: {
      locationId,
      content:
        "POV: slicing a brisket batch that rested 45 minutes 😮‍💨🥩 Who's coming for lunch? Tag your BBQ crew.",
      status: "SCHEDULED",
      scheduledFor: addDays(new Date(), 1),
      targets: {
        create: [
          ...(tiktok ? [{ accountId: tiktok.id, status: "PENDING" as const }] : []),
          ...(ig ? [{ accountId: ig.id, status: "PENDING" as const }] : []),
        ],
      },
    },
  });

  await prisma.socialPost.create({
    data: {
      locationId,
      content:
        "DRAFT: Catering season is open — whole briskets, pans of sides, and pickup packages for offices. DM or visit smokyoakbbq.com/catering",
      status: "DRAFT",
    },
  });

  void published;
}

async function seedHiringSms(locationId: string) {
  const count = await prisma.smsMessage.count({ where: { locationId } });
  if (count > 0) return;

  const applicant = await prisma.applicant.findFirst({
    where: { locationId, name: "Miguel Santos" },
  });
  if (!applicant) return;

  const phone = "+15551234567";
  await prisma.smsMessage.createMany({
    data: [
      {
        locationId,
        applicantId: applicant.id,
        direction: "INBOUND",
        fromPhone: applicant.phone,
        toPhone: phone,
        body: "APPLY DEMO1",
        status: "delivered",
        createdAt: subDays(new Date(), 5),
      },
      {
        locationId,
        applicantId: applicant.id,
        direction: "OUTBOUND",
        fromPhone: phone,
        toPhone: applicant.phone,
        body: "Thanks Miguel! You're applied for Server at Smoky Oak BBQ. We'll text you about next steps.",
        status: "delivered",
        createdAt: subDays(new Date(), 5),
      },
      {
        locationId,
        applicantId: applicant.id,
        direction: "OUTBOUND",
        fromPhone: phone,
        toPhone: applicant.phone,
        body: "Hi Miguel — can you interview Tuesday at 2pm? Reply YES to confirm.",
        status: "delivered",
        createdAt: subDays(new Date(), 4),
      },
    ],
  });

  const postingCount = await prisma.jobPosting.count({ where: { locationId } });
  if (postingCount < 2) {
    await prisma.jobPosting.create({
      data: {
        locationId,
        title: "Pit Line Cook",
        role: "Line Cook",
        applyCode: "PIT1",
        description: "Smokehouse line — smoker, fry, and expo rotation. BBQ experience a plus.",
        active: true,
      },
    });
  }
}

async function seedTrainingCompletions(locationId: string) {
  const count = await prisma.trainingCompletion.count({ where: { locationId } });
  if (count > 0) return;

  const modules = await prisma.trainingModule.findMany({ where: { locationId, active: true } });
  const staff = await prisma.staffMember.findMany({
    where: { locationId, active: true },
    take: 5,
  });
  if (modules.length === 0 || staff.length === 0) return;

  const modByKey = Object.fromEntries(modules.map((m) => [m.moduleKey, m]));
  const samples: { staffIndex: number; moduleKey: string; daysAgo: number }[] = [
    { staffIndex: 0, moduleKey: "sexual_harassment", daysAgo: 30 },
    { staffIndex: 0, moduleKey: "workplace_safety", daysAgo: 28 },
    { staffIndex: 1, moduleKey: "sexual_harassment", daysAgo: 45 },
    { staffIndex: 1, moduleKey: "food_safety_refresher", daysAgo: 20 },
    { staffIndex: 2, moduleKey: "sexual_harassment", daysAgo: 60 },
    { staffIndex: 2, moduleKey: "slip_trip_fall", daysAgo: 55 },
    { staffIndex: 3, moduleKey: "sexual_harassment", daysAgo: 15 },
    { staffIndex: 4, moduleKey: "emergency_procedures", daysAgo: 10 },
  ];

  for (const row of samples) {
    const mod = modByKey[row.moduleKey];
    const member = staff[row.staffIndex % staff.length];
    if (!mod || !member) continue;
    await prisma.trainingCompletion.create({
      data: {
        locationId,
        moduleId: mod.id,
        staffMemberId: member.id,
        completedAt: subDays(new Date(), row.daysAgo),
        score: 92 + (row.staffIndex % 7),
        signatureName: member.name,
        expiresAt: mod.renewalMonths ? addDays(subDays(new Date(), row.daysAgo), mod.renewalMonths * 30) : null,
      },
    });
  }
}

async function seedStaffClockPins(locationId: string) {
  const withoutPin = await prisma.staffMember.findMany({
    where: { locationId, clockPinHash: null, active: true },
    select: { id: true },
  });
  if (withoutPin.length === 0) return;

  const hash = hashClockPin("1234");
  await prisma.staffMember.updateMany({
    where: { id: { in: withoutPin.map((s) => s.id) } },
    data: { clockPinHash: hash },
  });
}

async function seedStaffMultiRoleRates(locationId: string) {
  const server = await prisma.staffMember.findFirst({
    where: { locationId, role: "Server", active: true },
  });
  if (!server) return;

  const roles = [
    { role: "Server", hourlyRate: 2.13, isTippedRole: true, tipPoints: 1 },
    { role: "Bartender", hourlyRate: 7.25, isTippedRole: true, tipPoints: 1.2 },
    { role: "Trainer", hourlyRate: 15, isTippedRole: false, tipPoints: 1 },
  ];

  for (const r of roles) {
    await prisma.staffRoleRate.upsert({
      where: {
        staffMemberId_role: { staffMemberId: server.id, role: r.role },
      },
      create: { staffMemberId: server.id, ...r },
      update: { hourlyRate: r.hourlyRate, isTippedRole: r.isTippedRole, tipPoints: r.tipPoints },
    });
  }

  const settings = await prisma.payrollSettings.findUnique({ where: { locationId } });
  if (settings) {
    await prisma.payrollSettings.update({
      where: { locationId },
      data: {
        splitShiftEnabled: true,
        splitShiftMinGapMinutes: 60,
      },
    });
  }
}

async function seedForgottenClockOutDemo(locationId: string) {
  let dishwasher = await prisma.staffMember.findFirst({
    where: { locationId, role: { contains: "Dish" } },
  });

  if (!dishwasher) {
    dishwasher = await prisma.staffMember.create({
      data: {
        locationId,
        name: "Jordan Lee",
        role: "Dishwasher",
        hourlyRate: 16.5,
        active: true,
        clockPinHash: hashClockPin("1234"),
      },
    });
  }

  const now = new Date();
  const scheduledEnd = subHours(now, 2);
  const shiftStart = subHours(scheduledEnd, 4);
  const shiftDate = startOfDay(shiftStart);

  let shift = await prisma.shift.findFirst({
    where: {
      locationId,
      staffMemberId: dishwasher.id,
      date: shiftDate,
      endTime: format(scheduledEnd, "HH:mm"),
    },
  });

  if (!shift) {
    shift = await prisma.shift.create({
      data: {
        locationId,
        staffMemberId: dishwasher.id,
        date: shiftDate,
        startTime: format(shiftStart, "HH:mm"),
        endTime: format(scheduledEnd, "HH:mm"),
        workRole: "Dishwasher",
        notes: "Demo: forgotten clock-out warning",
      },
    });
  }

  const existingOpen = await prisma.timeEntry.findFirst({
    where: { locationId, staffMemberId: dishwasher.id, clockOutAt: null },
  });

  if (!existingOpen) {
    await prisma.timeEntry.create({
      data: {
        locationId,
        staffMemberId: dishwasher.id,
        shiftId: shift.id,
        clockInAt: shiftStart,
        geoVerifiedIn: true,
      },
    });
  }
}

/** Demo: minor approaching curfew + employee due for meal break (manager alerts). */
async function seedComplianceLaborDemo(locationId: string) {
  const { getOrCreateComplianceSettings } = await import("./compliance/validate-shift");

  await getOrCreateComplianceSettings(locationId);
  await prisma.complianceSettings.update({
    where: { locationId },
    data: {
      minorSchoolNightEndHour: 19,
      minorBlockTimeClock: true,
      minorAlertMinutesBefore: 30,
      requireTipDeclaration: true,
    },
  });

  await prisma.location.update({
    where: { id: locationId },
    data: {
      mealBreakRequiredAfterHours: 5,
      mealBreakAlertMinutes: 15,
    },
  });

  let minor = await prisma.staffMember.findFirst({
    where: { locationId, name: "Alex Rivera (Minor)" },
  });
  if (!minor) {
    const dob = new Date();
    dob.setFullYear(dob.getFullYear() - 16);
    minor = await prisma.staffMember.create({
      data: {
        locationId,
        name: "Alex Rivera (Minor)",
        role: "Host",
        hourlyRate: 14,
        active: true,
        dateOfBirth: dob,
        clockPinHash: hashClockPin("1234"),
      },
    });
  }

  const now = new Date();
  const minorClockIn = subHours(now, 4.5);
  const existingMinorOpen = await prisma.timeEntry.findFirst({
    where: { locationId, staffMemberId: minor.id, clockOutAt: null },
  });
  if (!existingMinorOpen) {
    await prisma.timeEntry.create({
      data: {
        locationId,
        staffMemberId: minor.id,
        clockInAt: minorClockIn,
        workRole: "Host",
        hourlyRateAtPunch: 14,
        geoVerifiedIn: true,
      },
    });
  }

  let lineCook = await prisma.staffMember.findFirst({
    where: { locationId, name: "Sam Ortiz (Break demo)" },
  });
  if (!lineCook) {
    lineCook = await prisma.staffMember.create({
      data: {
        locationId,
        name: "Sam Ortiz (Break demo)",
        role: "Line Cook",
        hourlyRate: 18,
        active: true,
        clockPinHash: hashClockPin("1234"),
      },
    });
  }

  const breakClockIn = subHours(now, 5.2);
  const existingBreakOpen = await prisma.timeEntry.findFirst({
    where: { locationId, staffMemberId: lineCook.id, clockOutAt: null },
  });
  if (!existingBreakOpen) {
    await prisma.timeEntry.create({
      data: {
        locationId,
        staffMemberId: lineCook.id,
        clockInAt: breakClockIn,
        workRole: "Line Cook",
        hourlyRateAtPunch: 18,
        geoVerifiedIn: true,
      },
    });
  }
}

async function seedTimeEntries(locationId: string) {
  const count = await prisma.timeEntry.count({ where: { locationId } });
  if (count > 0) return;

  const elena = await prisma.staffMember.findFirst({
    where: { locationId, name: { contains: "Elena" } },
  });
  const marcus = await prisma.staffMember.findFirst({
    where: { locationId, name: { contains: "Marcus" } },
  });
  const priya = await prisma.staffMember.findFirst({
    where: { locationId, name: { contains: "Priya" } },
  });

  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
  let elenaShift = await prisma.shift.findFirst({
    where: {
      locationId,
      staffMemberId: elena?.id,
      date: { gte: weekStart },
    },
  });
  if (!elenaShift && elena) {
    elenaShift = await prisma.shift.create({
      data: {
        locationId,
        staffMemberId: elena.id,
        date: new Date(),
        startTime: "10:00",
        endTime: "18:00",
        workRole: "Line Cook",
      },
    });
  }

  if (elena && elenaShift) {
    await prisma.timeEntry.create({
      data: {
        locationId,
        staffMemberId: elena.id,
        shiftId: elenaShift.id,
        clockInAt: subHours(new Date(), 5),
        geoVerifiedIn: true,
        mealBreakTaken: false,
      },
    });
  }

  if (marcus) {
    await prisma.timeEntry.create({
      data: {
        locationId,
        staffMemberId: marcus.id,
        clockInAt: subDays(new Date(), 1),
        clockOutAt: subHours(subDays(new Date(), 1), -9),
        geoVerifiedIn: true,
        geoVerifiedOut: true,
        mealBreakTaken: true,
        restBreakTaken: true,
        approvalStatus: "PENDING",
      },
    });
  }

  if (priya) {
    await prisma.timeEntry.create({
      data: {
        locationId,
        staffMemberId: priya.id,
        clockInAt: subDays(new Date(), 2),
        clockOutAt: subHours(subDays(new Date(), 2), -7),
        geoVerifiedIn: true,
        geoVerifiedOut: true,
        approvalStatus: "APPROVED",
        approvedAt: subDays(new Date(), 1),
      },
    });
  }
}

async function seedShiftSwap(locationId: string) {
  const count = await prisma.shiftSwapRequest.count({ where: { locationId } });
  if (count > 0) return;

  const priya = await prisma.staffMember.findFirst({
    where: { locationId, name: { contains: "Priya" } },
  });
  const riley = await prisma.staffMember.findFirst({
    where: { locationId, name: { contains: "Riley" } },
  });
  if (!priya || !riley) return;

  const fri = addDays(startOfWeek(new Date(), { weekStartsOn: 1 }), 4);
  fri.setHours(12, 0, 0, 0);

  const priyaShift = await prisma.shift.create({
    data: {
      locationId,
      staffMemberId: priya.id,
      date: fri,
      startTime: "17:00",
      endTime: "23:00",
      workRole: "Server",
      notes: "DEMO_SWAP",
    },
  });

  const rileyShift = await prisma.shift.create({
    data: {
      locationId,
      staffMemberId: riley.id,
      date: addDays(fri, 1),
      startTime: "11:00",
      endTime: "17:00",
      workRole: "Host",
      notes: "DEMO_SWAP",
    },
  });

  await prisma.shiftSwapRequest.create({
    data: {
      locationId,
      kind: "SWAP",
      status: "PENDING",
      shiftId: priyaShift.id,
      requesterStaffId: priya.id,
      counterpartyStaffId: riley.id,
      offerShiftId: rileyShift.id,
      message: "Can't make Friday dinner — swap for your Saturday lunch host shift?",
    },
  });
}

async function seedPayrollSamples(locationId: string) {
  const settings = await getOrCreatePayrollSettings(locationId);
  if (!settings.ewaEnabled) {
    await prisma.payrollSettings.update({
      where: { locationId },
      data: {
        ewaEnabled: true,
        tipPoolMode: "POINTS",
        tipPoolRoles: JSON.stringify(["Server", "Bartender", "Host"]),
      },
    });
  }

  const priya = await prisma.staffMember.findFirst({
    where: { locationId, name: { contains: "Priya" } },
  });
  const elena = await prisma.staffMember.findFirst({
    where: { locationId, name: { contains: "Elena" } },
  });
  const marcus = await prisma.staffMember.findFirst({
    where: { locationId, name: { contains: "Marcus" } },
  });
  const david = await prisma.staffMember.findFirst({
    where: { locationId, name: { contains: "David" } },
  });
  const staffRows = [priya, elena, marcus, david].filter(Boolean);

  const runCount = await prisma.payrollRun.count({ where: { locationId } });
  if (runCount === 0) {
    const periodEnd = subDays(new Date(), 1);
    const periodStart = subDays(periodEnd, 13);

    const payPeriod = await prisma.payPeriod.create({
      data: {
        locationId,
        startDate: periodStart,
        endDate: periodEnd,
        status: "FINALIZED",
      },
    });

    await prisma.payrollRun.create({
      data: {
        locationId,
        payPeriodId: payPeriod.id,
        status: "FINALIZED",
        finalizedAt: subDays(new Date(), 1),
        lineItems: {
          create: staffRows.map((s, i) => ({
            staffMemberId: s!.id,
            regularHours: 32 + i * 4,
            overtimeHours: i === 0 ? 2 : 0,
            regularPay: (32 + i * 4) * s!.hourlyRate,
            overtimePay: i === 0 ? 2 * s!.hourlyRate * 1.5 : 0,
            tipsAllocated: s!.isTippedEmployee ? 280 + i * 40 : 0,
            grossPay:
              (32 + i * 4) * s!.hourlyRate +
              (i === 0 ? 2 * s!.hourlyRate * 1.5 : 0) +
              (s!.isTippedEmployee ? 280 + i * 40 : 0),
            netPay:
              (32 + i * 4) * s!.hourlyRate +
              (i === 0 ? 2 * s!.hourlyRate * 1.5 : 0) +
              (s!.isTippedEmployee ? 280 + i * 40 : 0),
          })),
        },
      },
    });
  }

  const draftCount = await prisma.payrollRun.count({
    where: { locationId, status: "DRAFT" },
  });
  if (draftCount === 0 && staffRows.length > 0) {
    const currentStart = startOfWeek(new Date(), { weekStartsOn: 1 });
    const currentEnd = addDays(currentStart, 13);
    const draftPeriod = await prisma.payPeriod.create({
      data: {
        locationId,
        startDate: currentStart,
        endDate: currentEnd,
        status: "DRAFT",
      },
    });
    await prisma.payrollRun.create({
      data: {
        locationId,
        payPeriodId: draftPeriod.id,
        status: "DRAFT",
        lineItems: {
          create: staffRows.map((s, i) => ({
            staffMemberId: s!.id,
            regularHours: 18 + i * 2,
            overtimeHours: 0,
            regularPay: (18 + i * 2) * s!.hourlyRate,
            overtimePay: 0,
            tipsAllocated: s!.isTippedEmployee ? 120 + i * 20 : 0,
            grossPay: (18 + i * 2) * s!.hourlyRate + (s!.isTippedEmployee ? 120 + i * 20 : 0),
            netPay: (18 + i * 2) * s!.hourlyRate + (s!.isTippedEmployee ? 120 + i * 20 : 0),
          })),
        },
      },
    });
  }

  if (priya) {
    const ewaCount = await prisma.ewaAdvance.count({
      where: { locationId, staffMemberId: priya.id },
    });
    if (ewaCount === 0) {
      await prisma.ewaAdvance.create({
        data: {
          locationId,
          staffMemberId: priya.id,
          amount: 75,
          fee: 0,
          status: "PENDING",
          earnedAtRequest: 420,
          requestedAt: subDays(new Date(), 2),
        },
      });
    }
  }

  const tipCount = await prisma.tipPoolRun.count({ where: { locationId } });
  if (tipCount === 0 && priya && david) {
    const periodEnd = subDays(new Date(), 1);
    const periodStart = subDays(periodEnd, 13);
    await prisma.tipPoolRun.create({
      data: {
        locationId,
        periodStart,
        periodEnd,
        totalTips: 1840,
        mode: "POINTS",
        status: "finalized",
        allocations: {
          create: [
            {
              staffMemberId: priya.id,
              hoursWorked: 38,
              tipPoints: 1.2,
              sharePercent: 42,
              tipsAmount: 773,
            },
            {
              staffMemberId: david.id,
              hoursWorked: 36,
              tipPoints: 1,
              sharePercent: 38,
              tipsAmount: 699,
            },
          ],
        },
      },
    });
  }
}
