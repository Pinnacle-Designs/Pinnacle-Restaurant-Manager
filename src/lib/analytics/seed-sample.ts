import { prisma } from "@/lib/prisma";

/** Rich sample data for analytics dashboards — Smoky Oak BBQ theme */
export async function seedAnalyticsSampleData(locationId: string) {
  const existingOrders = await prisma.order.count({ where: { locationId } });
  if (existingOrders > 5) return;

  await prisma.location.update({
    where: { id: locationId },
    data: { seatCount: 76, squareFootage: 3200 },
  });

  const menuItems = await prisma.menuItem.findMany({ where: { locationId } });

  const tables = await prisma.table.findMany({ where: { locationId } });
  const staff = await prisma.staffMember.findMany({ where: { locationId } });
  const inventory = await prisma.inventoryItem.findMany({ where: { locationId } });

  const channels = ["dine-in", "delivery", "pickup", "catering"];
  const now = Date.now();

  for (let day = 0; day < 28; day++) {
    const ordersPerDay = 6 + Math.floor(Math.random() * 10);
    for (let o = 0; o < ordersPerDay; o++) {
      const hour = 11 + Math.floor(Math.random() * 10);
      const createdAt = new Date(now - day * 86400000);
      createdAt.setHours(hour, Math.floor(Math.random() * 60), 0, 0);
      const menuItem = menuItems[Math.floor(Math.random() * menuItems.length)]!;
      const qty = 1 + Math.floor(Math.random() * 3);
      const channel = channels[Math.floor(Math.random() * channels.length)]!;
      const total = menuItem.price * qty;

      await prisma.order.create({
        data: {
          locationId,
          tableId: tables[Math.floor(Math.random() * tables.length)]?.id,
          status: "PAID",
          totalAmount: total,
          guestCount: 1 + Math.floor(Math.random() * 5),
          channel,
          discountAmount: Math.random() > 0.88 ? total * 0.1 : 0,
          compAmount: Math.random() > 0.94 ? total * 0.05 : 0,
          voidAmount: Math.random() > 0.97 ? total * 0.02 : 0,
          ticketTimeMinutes: 14 + Math.floor(Math.random() * 22),
          createdAt,
          items: {
            create: {
              menuItemId: menuItem.id,
              quantity: qty,
              price: menuItem.price,
            },
          },
        },
      });
    }
  }

  for (let day = 0; day < 14; day++) {
    const d = new Date(now - day * 86400000);
    for (const member of staff.slice(0, 4)) {
      await prisma.shift.create({
        data: {
          locationId,
          staffMemberId: member.id,
          date: d,
          startTime: day % 2 === 0 ? "10:00" : "11:00",
          endTime: day % 2 === 0 ? "18:00" : "22:00",
        },
      });
    }
  }

  await prisma.marketingCampaign.createMany({
    data: [
      { locationId, name: "Rib Night Instagram", channel: "instagram", spend: 920, impressions: 52000, clicks: 2800, conversions: 168, revenueAttributed: 5100, startDate: new Date(now - 18 * 86400000) },
      { locationId, name: "Google — BBQ near me", channel: "google", spend: 750, impressions: 22000, clicks: 1100, conversions: 124, revenueAttributed: 3800, startDate: new Date(now - 25 * 86400000) },
      { locationId, name: "Catering email blast", channel: "email", spend: 80, impressions: 4200, clicks: 380, conversions: 42, revenueAttributed: 6200, startDate: new Date(now - 12 * 86400000) },
    ],
  });

  await prisma.guestReview.createMany({
    data: [
      { locationId, source: "Google", rating: 5, comment: "Best brisket in Austin — bark was perfect!", category: "food_quality" },
      { locationId, source: "Google", rating: 4, comment: "Ribs were fall-off-the-bone. Sweet tea refills were fast.", category: "food_quality" },
      { locationId, source: "Google", rating: 3, comment: "Saturday wait was 35 minutes — worth it but plan ahead", category: "wait_time", resolved: false, createdAt: new Date(now - 2 * 86400000 + 19 * 3600000) },
      { locationId, source: "Yelp", rating: 5, comment: "Pulled pork sandwich and slaw — unreal", category: "food_quality" },
      { locationId, source: "OpenTable", rating: 4, comment: "Great family spot — kids loved the mac & cheese", category: "ambiance", createdAt: new Date(now - 4 * 86400000 + 18 * 3600000) },
      { locationId, source: "Google", rating: 2, comment: "Ran out of burnt ends before 7pm on Friday", category: "food_quality", resolved: true, createdAt: new Date(now - 6 * 86400000 + 20 * 3600000) },
      { locationId, source: "Yelp", rating: 5, comment: "Pitmaster sampler is the move — share with a friend", category: "food_quality" },
      { locationId, source: "Google", rating: 4, comment: "Solid happy hour bourbon lemonade", category: "food_quality", createdAt: new Date(now - 3 * 86400000 + 17 * 3600000) },
    ],
  });

  await prisma.vendorInvoice.createMany({
    data: [
      { locationId, vendor: "Hill Country Meats", amount: 2840, category: "Meat", priceChangePct: 6.8, invoiceDate: new Date(now - 5 * 86400000) },
      { locationId, vendor: "Hill Country Meats", amount: 2650, category: "Meat", priceChangePct: 4.2, invoiceDate: new Date(now - 35 * 86400000) },
      { locationId, vendor: "Hill Country Meats", amount: 2480, category: "Meat", priceChangePct: 2.5, invoiceDate: new Date(now - 65 * 86400000) },
      { locationId, vendor: "Green Valley Produce", amount: 420, category: "Produce", priceChangePct: 3.1, invoiceDate: new Date(now - 7 * 86400000) },
      { locationId, vendor: "Texas Fuel & Wood", amount: 660, category: "Fuel", priceChangePct: 8.5, invoiceDate: new Date(now - 9 * 86400000) },
      { locationId, vendor: "Smokehouse Supply", amount: 380, category: "Dry goods", priceChangePct: 1.2, invoiceDate: new Date(now - 11 * 86400000) },
      { locationId, vendor: "Farm Fresh Poultry", amount: 540, category: "Poultry", priceChangePct: 3.8, invoiceDate: new Date(now - 14 * 86400000) },
      { locationId, vendor: "Local Bakery Co", amount: 290, category: "Bakery", priceChangePct: 2.0, invoiceDate: new Date(now - 16 * 86400000) },
    ],
  });

  await prisma.vendorPriceHistory.createMany({
    data: [
      { locationId, vendor: "Hill Country Meats", itemName: "Beef brisket", category: "Meat", unitPrice: 6.8, unit: "lbs", effectiveDate: new Date(now - 5 * 86400000) },
      { locationId, vendor: "Hill Country Meats", itemName: "Beef brisket", category: "Meat", unitPrice: 6.4, unit: "lbs", effectiveDate: new Date(now - 40 * 86400000) },
      { locationId, vendor: "Hill Country Meats", itemName: "Pork shoulder", category: "Meat", unitPrice: 3.2, unit: "lbs", effectiveDate: new Date(now - 5 * 86400000) },
      { locationId, vendor: "Hill Country Meats", itemName: "St. Louis ribs", category: "Meat", unitPrice: 14.5, unit: "racks", effectiveDate: new Date(now - 8 * 86400000) },
      { locationId, vendor: "Green Valley Produce", itemName: "Cabbage", category: "Produce", unitPrice: 2.2, unit: "heads", effectiveDate: new Date(now - 7 * 86400000) },
      { locationId, vendor: "Green Valley Produce", itemName: "Cabbage", category: "Produce", unitPrice: 2.0, unit: "heads", effectiveDate: new Date(now - 42 * 86400000) },
      { locationId, vendor: "Smokehouse Supply", itemName: "House BBQ sauce", category: "Dry goods", unitPrice: 18.0, unit: "gal", effectiveDate: new Date(now - 10 * 86400000) },
      { locationId, vendor: "Bulk Foods Co", itemName: "Elbow macaroni", category: "Dry goods", unitPrice: 1.4, unit: "lbs", effectiveDate: new Date(now - 12 * 86400000) },
      { locationId, vendor: "Texas Fuel & Wood", itemName: "Oak smoking wood", category: "Fuel", unitPrice: 22.0, unit: "bags", effectiveDate: new Date(now - 9 * 86400000) },
      { locationId, vendor: "Farm Fresh Poultry", itemName: "Chicken quarters", category: "Poultry", unitPrice: 1.85, unit: "each", effectiveDate: new Date(now - 14 * 86400000) },
      { locationId, vendor: "Smokehouse Supply", itemName: "Alabama white sauce", category: "Dry goods", unitPrice: 16.0, unit: "gal", effectiveDate: new Date(now - 10 * 86400000) },
      { locationId, vendor: "Bulk Foods Co", itemName: "Sharp cheddar", category: "Dairy", unitPrice: 4.2, unit: "lbs", effectiveDate: new Date(now - 12 * 86400000) },
      { locationId, vendor: "Bulk Foods Co", itemName: "Unsalted butter", category: "Dairy", unitPrice: 5.4, unit: "lbs", effectiveDate: new Date(now - 15 * 86400000) },
      { locationId, vendor: "Green Valley Produce", itemName: "Fresh mint", category: "Produce", unitPrice: 8.5, unit: "lbs", effectiveDate: new Date(now - 6 * 86400000) },
    ],
  });

  const brisketInv = inventory.find((i) => i.name === "Beef brisket");
  if (brisketInv) {
    await prisma.inventoryWaste.createMany({
      data: [
        { locationId, inventoryItemId: brisketInv.id, itemName: brisketInv.name, quantity: 4, unit: brisketInv.unit, cost: 27, reason: "trim waste" },
        { locationId, itemName: "Brisket trim — unsellable", quantity: 6, unit: "lbs", cost: 22, reason: "prep waste" },
        { locationId, itemName: "Over-smoked rib batch", quantity: 2, unit: "racks", cost: 29, reason: "quality hold" },
      ],
    });
  }

  await prisma.externalFactor.createMany({
    data: [
      { locationId, date: new Date(now - 3 * 86400000), factorType: "weather", description: "Rainy evening — dine-in -15%, delivery +30%", impactPct: 12 },
      { locationId, date: new Date(now - 7 * 86400000), factorType: "event", description: "UT football game day — lunch rush +45%", impactPct: 45 },
      { locationId, date: new Date(now - 14 * 86400000), factorType: "holiday", description: "Memorial Day weekend — catering spike", impactPct: 28 },
      { locationId, date: new Date(now - 10 * 86400000), factorType: "sports", description: "ACL Fest nearby — late-night bar sales up", impactPct: 32 },
      { locationId, date: new Date(now - 5 * 86400000), factorType: "tourism", description: "SXSW overflow week — walk-ins up", impactPct: 38 },
      { locationId, date: new Date(now - 21 * 86400000), factorType: "school", description: "Spring break — family lunch traffic down", impactPct: -10 },
    ],
  });

  if ("websiteConnection" in prisma && prisma.websiteConnection) {
    await prisma.websiteConnection.upsert({
      where: { locationId },
      create: {
        locationId,
        url: "https://smokyoakbbq.com",
        connected: true,
        visitors30d: 6120,
        pageViews30d: 14800,
        sessions30d: 7340,
        bounceRate: 38.2,
        avgSessionSec: 132,
        topPages: JSON.stringify([
          { path: "/", views: 5120 },
          { path: "/menu", views: 3840 },
          { path: "/catering", views: 1920 },
          { path: "/about", views: 1180 },
        ]),
        referrers: JSON.stringify([
          { source: "Google Search", pct: 48 },
          { source: "Instagram", pct: 22 },
          { source: "Direct", pct: 16 },
        ]),
        lastSyncedAt: new Date(),
      },
      update: {
        url: "https://smokyoakbbq.com",
        connected: true,
        visitors30d: 6120,
        pageViews30d: 14800,
        sessions30d: 7340,
        lastSyncedAt: new Date(),
      },
    });
  }
}
