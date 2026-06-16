import { prisma } from "@/lib/prisma";
import { geocodeLocation } from "@/lib/external/geocode";
import { fetchWeatherForecast } from "@/lib/external/weather";
import {
  buildCategoryCoverage,
  buildPatternSummaries,
  learnExternalPatterns,
  normalizeFactorCategory,
} from "@/lib/external/pattern-learning";
import { syncWeatherForecasts } from "@/lib/external/sync-weather";
import type {
  AnalyticsPayload,
  AnalyticsInsight,
  Daypart,
  OperationsHighlights,
  ExternalFactorsHighlights,
  ExternalFactorCategory,
  ForecastingHighlights,
  WeatherForecastDay,
  ProfitabilityHighlights,
  PurchasingHighlights,
  CustomerExperienceHighlights,
  FoodCostHighlights,
  LaborHighlights,
  MarketingHighlights,
  MenuEngineeringHighlights,
  MenuEngineeringItem,
  MenuQuadrant,
} from "./types";

const PERIOD_DAYS = 30;

async function safeVendorPriceHistory(locationId: string) {
  if (!("vendorPriceHistory" in prisma) || !prisma.vendorPriceHistory) return [];
  try {
    return await prisma.vendorPriceHistory.findMany({
      where: { locationId },
      orderBy: { effectiveDate: "asc" },
    });
  } catch {
    return [];
  }
}

function hourFromTime(t: string): number {
  return parseInt(t.split(":")[0]!, 10);
}

function daypartFromHour(hour: number): Daypart {
  if (hour >= 5 && hour < 11) return "breakfast";
  if (hour >= 11 && hour < 15) return "lunch";
  if (hour >= 15 && hour < 22) return "dinner";
  return "late";
}

function shiftHours(start: string, end: string): number {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  return (eh! + em! / 60) - (sh! + sm! / 60);
}

function menuQuadrant(
  popularityPct: number,
  marginPct: number,
  avgPopularityPct: number,
  avgMarginPct: number
): MenuQuadrant {
  const popular = popularityPct >= avgPopularityPct;
  const profitable = marginPct >= avgMarginPct;
  if (popular && profitable) return "star";
  if (popular && !profitable) return "plowhorse";
  if (!popular && profitable) return "puzzle";
  return "dog";
}

function dateKey(d: Date) {
  return d.toISOString().split("T")[0]!;
}

function orderNetAmount(o: {
  totalAmount: number;
  discountAmount: number;
  compAmount: number;
  voidAmount: number;
}) {
  return o.totalAmount - o.discountAmount - o.compAmount - o.voidAmount;
}

function estimateOrderProfit(
  netOrder: number,
  orderFoodCost: number,
  laborCost: number,
  netSales: number
) {
  const laborRate = netSales > 0 ? laborCost / netSales : 0.25;
  return netOrder - orderFoodCost - netOrder * laborRate;
}

function formatDeliveryProvider(channel: string) {
  const key = channel.toLowerCase();
  if (/doordash/i.test(key)) return "DoorDash";
  if (/grubhub/i.test(key)) return "Grubhub";
  if (/uber|ubereats/i.test(key)) return "Uber Eats";
  if (/postmates/i.test(key)) return "Postmates";
  if (/seamless/i.test(key)) return "Seamless";
  if (/caviar/i.test(key)) return "Caviar";
  if (/delivery/i.test(key)) return "In-house Delivery";
  return channel.charAt(0).toUpperCase() + channel.slice(1);
}

function isDeliveryChannel(channel: string) {
  return /delivery|doordash|grubhub|uber|postmates|seamless|caviar/i.test(channel);
}

function portionCostFromItem(item: {
  costPerUnit: number;
  portionSize: number | null;
  yieldPct: number;
}) {
  if (!item.portionSize || item.portionSize <= 0) return null;
  const usableCost = item.costPerUnit / (item.yieldPct / 100);
  return usableCost / item.portionSize;
}

function formatHourLabel(hour: number) {
  const suffix = hour >= 12 ? "PM" : "AM";
  const h = hour % 12 === 0 ? 12 : hour % 12;
  return `${h}:00 ${suffix}`;
}

async function safeWebsiteConnection(locationId: string) {
  if (!("websiteConnection" in prisma) || !prisma.websiteConnection) return null;
  try {
    return await prisma.websiteConnection.findUnique({ where: { locationId } });
  } catch {
    return null;
  }
}

async function safeSocialPosts(locationId: string, periodStart: Date) {
  if (!("socialPost" in prisma) || !prisma.socialPost) return [];
  try {
    return await prisma.socialPost.findMany({
      where: {
        locationId,
        publishedAt: { gte: periodStart },
      },
      include: { targets: true },
    });
  } catch {
    return [];
  }
}

export async function computeAnalytics(locationId: string): Promise<AnalyticsPayload> {
  const now = new Date();
  const periodStart = new Date(now.getTime() - PERIOD_DAYS * 24 * 60 * 60 * 1000);
  const yesterdayStart = new Date(now);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);
  yesterdayStart.setHours(0, 0, 0, 0);
  const yesterdayEnd = new Date(yesterdayStart);
  yesterdayEnd.setDate(yesterdayEnd.getDate() + 1);

  const location = await prisma.location.findUnique({ where: { id: locationId } });
  if (location) {
    await Promise.race([
      syncWeatherForecasts(locationId, location),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("weather sync timeout")), 8_000)
      ),
    ]).catch((err) => {
      console.warn("Weather sync skipped:", err);
    });
  }

  const [
    orders,
    menuItems,
    inventory,
    staff,
    shifts,
    expenses,
    waste,
    campaigns,
    reviews,
    vendorInvoices,
    vendorPriceHistory,
    draftPurchaseOrders,
    vendorEdiConnections,
    externalFactors,
    socialAccounts,
    websiteConnection,
    socialPosts,
  ] = await Promise.all([
    prisma.order.findMany({
      where: { locationId, createdAt: { gte: periodStart } },
      include: { items: { include: { menuItem: true } }, table: true },
    }),
    prisma.menuItem.findMany({ where: { locationId } }),
    prisma.inventoryItem.findMany({ where: { locationId } }),
    prisma.staffMember.findMany({ where: { locationId, active: true } }),
    prisma.shift.findMany({
      where: { locationId, date: { gte: periodStart } },
      include: { staffMember: true },
    }),
    prisma.expense.findMany({ where: { locationId, date: { gte: periodStart } } }),
    prisma.inventoryWaste.findMany({ where: { locationId, date: { gte: periodStart } } }),
    prisma.marketingCampaign.findMany({ where: { locationId } }),
    prisma.guestReview.findMany({
      where: { locationId, createdAt: { gte: periodStart } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.vendorInvoice.findMany({
      where: { locationId },
      orderBy: { invoiceDate: "asc" },
    }),
    safeVendorPriceHistory(locationId),
    prisma.vendorPurchaseOrder.findMany({
      where: { locationId, status: "DRAFT" },
      orderBy: { submittedAt: "desc" },
    }),
    prisma.vendorEdiConnection.findMany({ where: { locationId } }),
    prisma.externalFactor.findMany({
      where: { locationId, date: { gte: periodStart } },
      orderBy: { date: "desc" },
    }),
    prisma.socialAccount.findMany({ where: { locationId, connected: true } }),
    safeWebsiteConnection(locationId),
    safeSocialPosts(locationId, periodStart),
  ]);

  let vendorBidsForPurchasing: Array<{
    itemName: string;
    recommendedVendor: string;
    savingsPct: number;
    savingsAmount: number;
    suggestedQty: number;
    vendors: Array<{ vendor: string; unitPrice: number }>;
  }> = [];
  try {
    const { getCrossVendorBids } = await import("@/lib/purchasing/vendor-bidding");
    const raw = await getCrossVendorBids(locationId);
    vendorBidsForPurchasing = raw.map((b) => ({
      itemName: b.itemName,
      recommendedVendor: b.recommendedVendor,
      savingsPct: b.savingsPct,
      savingsAmount: b.savingsAmount,
      suggestedQty: b.suggestedQty,
      vendors: b.vendors.map((v) => ({ vendor: v.vendor, unitPrice: v.unitPrice })),
    }));
  } catch {
    /* bidding optional */
  }

  const paidOrders = orders.filter((o) => o.status === "PAID");
  const yesterdayOrders = paidOrders.filter(
    (o) => o.createdAt >= yesterdayStart && o.createdAt < yesterdayEnd
  );

  const totalSales = paidOrders.reduce((s, o) => s + o.totalAmount, 0);
  const totalDiscounts = paidOrders.reduce((s, o) => s + o.discountAmount + o.compAmount, 0);
  const totalVoids = paidOrders.reduce((s, o) => s + o.voidAmount, 0);
  const netSales = totalSales - totalDiscounts - totalVoids;
  const guestCount = paidOrders.reduce((s, o) => s + o.guestCount, 0);
  const seats = location?.seatCount ?? 40;
  const sqFt = location?.squareFootage ?? 2000;

  const scheduledHours = shifts.reduce((s, sh) => s + shiftHours(sh.startTime, sh.endTime), 0);
  const laborCost = shifts.reduce(
    (s, sh) => s + shiftHours(sh.startTime, sh.endTime) * (sh.staffMember?.hourlyRate ?? 0),
    0
  );
  const weeksInPeriod = Math.max(PERIOD_DAYS / 7, 1);
  const weeklyOtThreshold = 40;
  const overtimeHours = staff.reduce((sum, s) => {
    const memberHours = shifts
      .filter((sh) => sh.staffMemberId === s.id)
      .reduce((h, sh) => h + shiftHours(sh.startTime, sh.endTime), 0);
    const weeklyAvg = memberHours / weeksInPeriod;
    return sum + Math.max(0, weeklyAvg - weeklyOtThreshold) * weeksInPeriod;
  }, 0);
  const actualHours = scheduledHours * 0.98;
  const laborVarianceHours = actualHours - scheduledHours;
  const laborVariancePct = scheduledHours > 0 ? (laborVarianceHours / scheduledHours) * 100 : 0;

  const inventoryValuation = inventory.reduce((s, i) => s + i.quantity * i.costPerUnit, 0);
  const wasteCost = waste.reduce((s, w) => s + w.cost, 0);
  const spoilageCost = waste.filter((w) => w.reason.toLowerCase().includes("spoil")).reduce((s, w) => s + w.cost, 0);

  const foodExpense = expenses
    .filter((e) => /food|supply|inventory/i.test(e.category))
    .reduce((s, e) => s + e.amount, 0);
  const actualFoodCost = foodExpense + wasteCost;
  const theoreticalFoodCost = paidOrders.reduce((s, o) => {
    return (
      s +
      o.items.reduce((is, item) => {
        const rc = item.menuItem.recipeCost || item.menuItem.price * 0.28;
        return is + rc * item.quantity;
      }, 0)
    );
  }, 0);

  const foodCostPct = netSales > 0 ? (actualFoodCost / netSales) * 100 : 0;
  const theoreticalFoodCostPct = netSales > 0 ? (theoreticalFoodCost / netSales) * 100 : 0;
  const variancePct = theoreticalFoodCostPct - foodCostPct;
  const dailyUsage = theoreticalFoodCost / PERIOD_DAYS;
  const daysOnHand = dailyUsage > 0 ? inventoryValuation / dailyUsage : 0;
  const inventoryTurnover = inventoryValuation > 0 ? actualFoodCost / inventoryValuation : 0;

  const laborPct = netSales > 0 ? (laborCost / netSales) * 100 : 0;
  const profitEstimate = netSales - actualFoodCost - laborCost - expenses
    .filter((e) => !/food|supply|inventory|labor/i.test(e.category))
    .reduce((s, e) => s + e.amount, 0);

  const revenuePerLaborHour = actualHours > 0 ? netSales / actualHours : 0;
  const revenuePerSeat = seats > 0 ? netSales / seats : 0;
  const revenuePerSqFt = sqFt > 0 ? netSales / sqFt : 0;
  const averageCheck = paidOrders.length > 0 ? netSales / paidOrders.length : 0;
  const averageSpendPerGuest = guestCount > 0 ? netSales / guestCount : 0;

  const daypartMap: Record<Daypart, { sales: number; orders: number }> = {
    breakfast: { sales: 0, orders: 0 },
    lunch: { sales: 0, orders: 0 },
    dinner: { sales: 0, orders: 0 },
    late: { sales: 0, orders: 0 },
  };
  const hourMap: Record<number, { sales: number; orders: number }> = {};
  const channelMap: Record<string, { sales: number; profit: number; orders: number }> = {};
  const itemSales: Record<string, { name: string; sales: number; quantity: number }> = {};
  const categorySales: Record<string, { sales: number; quantity: number }> = {};
  const dayProfit: Record<string, number> = {};
  const daySalesMap: Record<string, number> = {};
  const hourProfitMap: Record<number, number> = {};
  const daypartProfitMap: Record<Daypart, number> = {
    breakfast: 0,
    lunch: 0,
    dinner: 0,
    late: 0,
  };
  const categoryProfitMap: Record<string, number> = {};
  const channelProfitMap: Record<string, number> = {};

  for (const o of paidOrders) {
    const hour = o.createdAt.getHours();
    const dp = daypartFromHour(hour);
    const netOrder = orderNetAmount(o);
    daypartMap[dp].sales += netOrder;
    daypartMap[dp].orders += 1;
    if (!hourMap[hour]) hourMap[hour] = { sales: 0, orders: 0 };
    hourMap[hour].sales += netOrder;
    hourMap[hour].orders += 1;

    const ch = o.channel || "dine-in";
    if (!channelMap[ch]) channelMap[ch] = { sales: 0, profit: 0, orders: 0 };
    const orderFoodCost = o.items.reduce(
      (s, i) => s + (i.menuItem.recipeCost || i.menuItem.price * 0.28) * i.quantity,
      0
    );
    const orderProfit = estimateOrderProfit(netOrder, orderFoodCost, laborCost, netSales);
    channelMap[ch].sales += netOrder;
    channelMap[ch].profit += netOrder - orderFoodCost;
    channelMap[ch].orders += 1;
    channelProfitMap[ch] = (channelProfitMap[ch] ?? 0) + orderProfit;

    const dk = dateKey(o.createdAt);
    dayProfit[dk] = (dayProfit[dk] ?? 0) + orderProfit;
    daySalesMap[dk] = (daySalesMap[dk] ?? 0) + netOrder;
    hourProfitMap[hour] = (hourProfitMap[hour] ?? 0) + orderProfit;
    daypartProfitMap[dp] += orderProfit;

    for (const item of o.items) {
      const key = item.menuItemId;
      if (!itemSales[key]) {
        itemSales[key] = { name: item.menuItem.name, sales: 0, quantity: 0 };
      }
      itemSales[key].sales += item.price * item.quantity;
      itemSales[key].quantity += item.quantity;

      const cat = item.menuItem.category;
      if (!categorySales[cat]) categorySales[cat] = { sales: 0, quantity: 0 };
      categorySales[cat].sales += item.price * item.quantity;
      categorySales[cat].quantity += item.quantity;

      const itemProfit =
        (item.price - (item.menuItem.recipeCost || item.menuItem.price * 0.28)) * item.quantity;
      categoryProfitMap[cat] = (categoryProfitMap[cat] ?? 0) + itemProfit;
    }
  }

  const learnedPatterns = learnExternalPatterns(paidOrders, externalFactors);

  const totalItemsSold = Object.values(itemSales).reduce((s, i) => s + i.quantity, 0);
  const itemsBase: Omit<MenuEngineeringItem, "quadrant">[] = menuItems.map((m) => {
    const sold = itemSales[m.id]?.quantity ?? 0;
    const recipeCost = m.recipeCost || m.price * 0.28;
    const margin = m.price - recipeCost;
    const marginPct = m.price > 0 ? (margin / m.price) * 100 : 0;
    const popularityPct = totalItemsSold > 0 ? (sold / totalItemsSold) * 100 : 0;
    return {
      id: m.id,
      name: m.name,
      category: m.category,
      price: m.price,
      recipeCost,
      margin,
      marginPct,
      quantitySold: sold,
      popularityPct,
      contribution: margin * sold,
    };
  });

  const soldItems = itemsBase.filter((i) => i.quantitySold > 0);
  const avgPopularityPct =
    soldItems.length > 0
      ? soldItems.reduce((s, i) => s + i.popularityPct, 0) / soldItems.length
      : 0;
  const avgMarginPct =
    itemsBase.length > 0
      ? itemsBase.reduce((s, i) => s + i.marginPct, 0) / itemsBase.length
      : 0;

  const menuEngineeringItems: MenuEngineeringItem[] = itemsBase.map((i) => ({
    ...i,
    quadrant: menuQuadrant(i.popularityPct, i.marginPct, avgPopularityPct, avgMarginPct),
  }));

  const totalContribution = menuEngineeringItems.reduce((s, i) => s + i.contribution, 0);

  const menuMix = Object.entries(categorySales)
    .map(([category, data]) => ({
      category,
      sales: data.sales,
      quantity: data.quantity,
      mixPct: netSales > 0 ? (data.sales / netSales) * 100 : 0,
      contribution: menuEngineeringItems
        .filter((i) => i.category === category)
        .reduce((s, i) => s + i.contribution, 0),
    }))
    .sort((a, b) => b.sales - a.sales);

  const dogs = menuEngineeringItems.filter((m) => m.quadrant === "dog");

  const menuHighlights: MenuEngineeringHighlights = {
    promoteItems: [
      ...menuEngineeringItems
        .filter((m) => m.quadrant === "star")
        .sort((a, b) => b.contribution - a.contribution),
      ...menuEngineeringItems
        .filter((m) => m.quadrant === "puzzle")
        .sort((a, b) => b.marginPct - a.marginPct),
    ]
      .slice(0, 5)
      .map((i) => ({
        name: i.name,
        quadrant: i.quadrant,
        marginPct: i.marginPct,
        popularityPct: i.popularityPct,
        quantitySold: i.quantitySold,
      })),
    repriceItems: [...menuEngineeringItems.filter((m) => m.quadrant === "plowhorse")]
      .sort((a, b) => b.quantitySold - a.quantitySold)
      .slice(0, 5)
      .map((i) => ({
        name: i.name,
        price: i.price,
        marginPct: i.marginPct,
        popularityPct: i.popularityPct,
        quantitySold: i.quantitySold,
      })),
    removeItems: [...dogs]
      .sort((a, b) => a.contribution - b.contribution)
      .slice(0, 5)
      .map((i) => ({
        name: i.name,
        marginPct: i.marginPct,
        popularityPct: i.popularityPct,
        quantitySold: i.quantitySold,
        contribution: i.contribution,
      })),
    topContributor:
      menuEngineeringItems.length > 0
        ? {
            name: [...menuEngineeringItems].sort((a, b) => b.contribution - a.contribution)[0]!.name,
            contribution: [...menuEngineeringItems].sort((a, b) => b.contribution - a.contribution)[0]!
              .contribution,
          }
        : null,
  };

  const marketingSpend = campaigns.reduce((s, c) => s + c.spend, 0);
  const conversions = campaigns.reduce((s, c) => s + c.conversions, 0);
  const attributedRevenue = campaigns.reduce((s, c) => s + c.revenueAttributed, 0);
  const returnOnAdSpend = marketingSpend > 0 ? attributedRevenue / marketingSpend : 0;
  const socialEngagement = socialAccounts.reduce((s, a) => s + a.followers, 0);

  const tableVisitCount = new Map<string, number>();
  let newGuests = 0;
  let returningGuests = 0;
  for (const o of paidOrders) {
    const key = o.tableId ?? `walk-in-${dateKey(o.createdAt)}-${o.id}`;
    const visits = (tableVisitCount.get(key) ?? 0) + 1;
    tableVisitCount.set(key, visits);
    if (visits === 1) newGuests += o.guestCount;
    else returningGuests += o.guestCount;
  }

  const ordersWithCoupon = paidOrders.filter((o) => o.discountAmount > 0);
  const totalCouponDiscount = paidOrders.reduce((s, o) => s + o.discountAmount, 0);
  const couponUsage = {
    ordersWithCoupon: ordersWithCoupon.length,
    totalDiscount: totalCouponDiscount,
    couponRatePct: paidOrders.length > 0 ? (ordersWithCoupon.length / paidOrders.length) * 100 : 0,
    avgDiscount: ordersWithCoupon.length > 0 ? totalCouponDiscount / ordersWithCoupon.length : 0,
  };

  const emailCampaigns = campaigns.filter((c) => /email/i.test(c.channel));
  const emailPerformance = {
    campaigns: emailCampaigns.length,
    spend: emailCampaigns.reduce((s, c) => s + c.spend, 0),
    clicks: emailCampaigns.reduce((s, c) => s + c.clicks, 0),
    conversions: emailCampaigns.reduce((s, c) => s + c.conversions, 0),
    revenue: emailCampaigns.reduce((s, c) => s + c.revenueAttributed, 0),
    roas:
      emailCampaigns.reduce((s, c) => s + c.spend, 0) > 0
        ? emailCampaigns.reduce((s, c) => s + c.revenueAttributed, 0) /
          emailCampaigns.reduce((s, c) => s + c.spend, 0)
        : 0,
  };

  const socialMedia = {
    totalFollowers: socialEngagement,
    accounts: socialAccounts.map((a) => ({
      platform: a.platform,
      followers: a.followers,
      postsPublished: socialPosts.filter((p) =>
        p.targets.some((t) => t.accountId === a.id && t.status === "PUBLISHED")
      ).length,
    })),
    totalPostsPublished: socialPosts.filter((p) => p.publishedAt != null).length,
  };

  let topReferrers: Array<{ source: string; pct: number }> = [];
  if (websiteConnection?.referrers) {
    try {
      const parsed = JSON.parse(websiteConnection.referrers) as Array<{ source: string; pct: number }>;
      topReferrers = Array.isArray(parsed) ? parsed : [];
    } catch {
      topReferrers = [];
    }
  }
  const googleReferrerPct = topReferrers.find((r) => /google/i.test(r.source))?.pct ?? 42;

  const websiteTraffic = websiteConnection
    ? {
        connected: websiteConnection.connected,
        url: websiteConnection.url,
        visitors30d: websiteConnection.visitors30d,
        pageViews30d: websiteConnection.pageViews30d,
        sessions30d: websiteConnection.sessions30d,
        bounceRate: websiteConnection.bounceRate,
        topReferrers,
      }
    : null;

  const googleReviews = reviews.filter((r) => /google/i.test(r.source));
  const googleCampaign = campaigns.find((c) => /google/i.test(c.channel));
  const googleBusiness = {
    reviewCount: googleReviews.length,
    avgRating:
      googleReviews.length > 0
        ? googleReviews.reduce((s, r) => s + r.rating, 0) / googleReviews.length
        : 0,
    profileViews30d:
      googleCampaign?.impressions ??
      Math.round((websiteConnection?.visitors30d ?? 0) * (googleReferrerPct / 100)),
    directionRequests: googleCampaign?.clicks ?? Math.round(googleReviews.length * 15),
  };

  const campaignSpendByChannel = campaigns.reduce(
    (acc, c) => {
      const ch = c.channel.toLowerCase();
      if (!acc[ch]) acc[ch] = { spend: 0, revenue: 0 };
      acc[ch].spend += c.spend;
      acc[ch].revenue += c.revenueAttributed;
      return acc;
    },
    {} as Record<string, { spend: number; revenue: number }>
  );

  const profitableChannels = Object.entries(channelMap)
    .map(([channel, data]) => {
      const marginPct = data.sales > 0 ? (data.profit / data.sales) * 100 : 0;
      const mkt = campaignSpendByChannel[channel.toLowerCase()] ?? { spend: 0, revenue: 0 };
      return {
        channel,
        profit: data.profit,
        marginPct,
        orders: data.orders,
        marketingSpend: mkt.spend,
        roas: mkt.spend > 0 ? mkt.revenue / mkt.spend : 0,
      };
    })
    .sort((a, b) => b.profit - a.profit);

  const salesGeneratingStatus: MarketingHighlights["salesGenerating"]["status"] =
    attributedRevenue > 0 && returnOnAdSpend >= 2
      ? "yes"
      : attributedRevenue > 0
        ? "weak"
        : "no_data";

  const marketingHighlights: MarketingHighlights = {
    salesGenerating: {
      status: salesGeneratingStatus,
      reason:
        salesGeneratingStatus === "yes"
          ? `$${attributedRevenue.toFixed(0)} attributed revenue at ${returnOnAdSpend.toFixed(1)}x ROAS — marketing is driving sales.`
          : salesGeneratingStatus === "weak"
            ? `$${attributedRevenue.toFixed(0)} attributed but ROAS only ${returnOnAdSpend.toFixed(1)}x — optimize underperforming campaigns.`
            : "No attributed campaign revenue — connect campaigns or load sample data.",
      attributedRevenue,
      returnOnAdSpend,
    },
    profitableChannels: profitableChannels.slice(0, 6),
  };

  const avgRating =
    reviews.length > 0 ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : 0;

  const ticketTimes = paidOrders.filter((o) => o.ticketTimeMinutes != null);
  const avgTicketTime =
    ticketTimes.length > 0
      ? ticketTimes.reduce((s, o) => s + o.ticketTimeMinutes!, 0) / ticketTimes.length
      : 18;

  const salesTrend: Array<{ date: string; sales: number }> = [];
  const profitTrend: Array<{ date: string; profit: number }> = [];
  const reviewTrend: Array<{ date: string; avgRating: number }> = [];

  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    d.setHours(0, 0, 0, 0);
    const next = new Date(d);
    next.setDate(next.getDate() + 1);
    const dk = dateKey(d);
    const dayOrders = paidOrders.filter((o) => o.createdAt >= d && o.createdAt < next);
    const daySales = dayOrders.reduce((s, o) => s + o.totalAmount, 0);
    salesTrend.push({ date: dk, sales: daySales });
    profitTrend.push({ date: dk, profit: dayProfit[dk] ?? daySales * 0.15 });
    const dayReviews = reviews.filter((r) => r.createdAt >= d && r.createdAt < next);
    reviewTrend.push({
      date: dk,
      avgRating:
        dayReviews.length > 0
          ? dayReviews.reduce((s, r) => s + r.rating, 0) / dayReviews.length
          : avgRating,
    });
  }

  const yesterdaySales = yesterdayOrders.reduce((s, o) => s + o.totalAmount, 0);
  const yesterdayNet =
    yesterdaySales -
    yesterdayOrders.reduce((s, o) => s + o.discountAmount + o.compAmount + o.voidAmount, 0);
  const yesterdayGuests = yesterdayOrders.reduce((s, o) => s + o.guestCount, 0);
  const yesterdayFoodPct = yesterdayNet > 0 ? (actualFoodCost / PERIOD_DAYS / yesterdayNet) * 100 * 30 : foodCostPct;
  const yesterdayLaborPct = yesterdayNet > 0 ? (laborCost / PERIOD_DAYS / yesterdayNet) * 100 * 30 : laborPct;

  const alerts: AnalyticsPayload["executive"]["alerts"] = [];
  const lowStock = inventory.filter((i) => i.quantity <= i.minQuantity);
  if (lowStock.length > 0) {
    alerts.push({
      type: "inventory",
      message: `${lowStock.length} inventory item(s) below minimum`,
      severity: "HIGH",
    });
  }
  if (foodCostPct > 32) {
    alerts.push({
      type: "food_cost",
      message: `Food cost at ${foodCostPct.toFixed(1)}% exceeds 32% target`,
      severity: "HIGH",
    });
  }
  if (laborPct > 30) {
    alerts.push({
      type: "labor",
      message: `Labor at ${laborPct.toFixed(1)}% exceeds 30% target`,
      severity: "MEDIUM",
    });
  }
  if (dogs.length > 0) {
    alerts.push({
      type: "menu",
      message: `${dogs.length} menu item(s) are low profit and low popularity`,
      severity: "MEDIUM",
    });
  }
  const badReviews = reviews.filter((r) => r.rating < 3 && !r.resolved);
  if (badReviews.length > 0) {
    alerts.push({
      type: "reviews",
      message: `${badReviews.length} unresolved negative review(s)`,
      severity: "HIGH",
    });
  }

  const aiInsights = generateAnalyticsInsights({
    netSales,
    foodCostPct,
    laborPct,
    menuEngineeringItems,
    lowStock,
    variancePct,
    daysOnHand,
    daypartMap,
    hourMap,
    channelMap,
    itemSales,
    categorySales,
    campaigns,
    reviews,
    vendorInvoices,
    externalFactors,
    averageCheck,
    averageSpendPerGuest,
    guestCount,
    revenuePerSeat,
    revenuePerLaborHour,
    revenuePerSqFt,
  });

  const DOW_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const salesByDow = Array(7).fill(0) as number[];
  const cateringSalesByDow = Array(7).fill(0) as number[];
  const cateringOrdersByDow = Array(7).fill(0) as number[];

  for (const o of paidOrders) {
    const dow = o.createdAt.getDay();
    const net = orderNetAmount(o);
    salesByDow[dow] += net;
    if ((o.channel || "dine-in") === "catering") {
      cateringSalesByDow[dow] += net;
      cateringOrdersByDow[dow] += 1;
    }
  }

  const avgSalesByDow = salesByDow.map((s) => s / weeksInPeriod);
  const avgCateringSalesByDow = cateringSalesByDow.map((s) => s / weeksInPeriod);
  const avgCateringOrdersByDow = cateringOrdersByDow.map((o) => o / weeksInPeriod);
  const avgDailySales = netSales / PERIOD_DAYS;

  const deliveryPatternEarly = learnedPatterns.find((p) => p.category === "weather" && p.metric === "delivery");
  const eventPatternBoost =
    learnedPatterns.find((p) => (p.category === "event" || p.category === "holiday" || p.category === "sports") && p.impactPct > 0)
      ?.impactPct ?? (externalFactors.length > 0 ? 3 : 0);

  const salesForecast7d = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now);
    d.setDate(d.getDate() + i + 1);
    const dow = d.getDay();
    const base = avgSalesByDow[dow] || avgDailySales;
    const externalBoost = 1 + eventPatternBoost / 100 / 4;
    const rainBoost =
      deliveryPatternEarly && deliveryPatternEarly.impactPct > 0 ? 1 + deliveryPatternEarly.impactPct / 100 / 10 : 1;
    return { date: dateKey(d), predicted: base * externalBoost * rainBoost };
  });

  const laborHoursForecast7d = salesForecast7d.map((f) => ({
    date: f.date,
    hours: f.predicted > 0 ? f.predicted / (revenuePerLaborHour || 100) : scheduledHours / 7,
  }));

  const cateringDemandForecast7d = salesForecast7d.map((f) => {
    const d = new Date(`${f.date}T12:00:00`);
    const dow = d.getDay();
    return {
      date: f.date,
      predictedOrders: Math.max(0, Math.round(avgCateringOrdersByDow[dow] || 0)),
      predictedSales: avgCateringSalesByDow[dow] || 0,
    };
  });

  const inventoryRecommendations = inventory
    .filter((i) => i.quantity <= i.minQuantity * 1.5)
    .map((i) => ({
      name: i.name,
      suggestedOrder: Math.max(i.minQuantity * 2 - i.quantity, i.minQuantity),
      unit: i.unit,
    }));

  const weekdayAvg =
    [1, 2, 3, 4, 5].reduce((s, d) => s + avgSalesByDow[d], 0) / 5;
  const weekendAvg = (avgSalesByDow[0] + avgSalesByDow[6]) / 2;
  const weekendLiftPct = weekdayAvg > 0 ? ((weekendAvg - weekdayAvg) / weekdayAvg) * 100 : 0;
  const peakDow = avgSalesByDow.indexOf(Math.max(...avgSalesByDow));
  const seasonalTrends = [
    {
      label: "Weekend vs weekday",
      insight:
        weekendLiftPct > 5
          ? `Weekend sales average ${weekendLiftPct.toFixed(0)}% higher than weekdays — staff and prep up Fri–Sun.`
          : weekendLiftPct < -5
            ? `Weekdays outperform weekends by ${Math.abs(weekendLiftPct).toFixed(0)}% — lunch and catering drive volume.`
            : "Weekend and weekday sales are balanced — maintain consistent staffing.",
      impactPct: weekendLiftPct,
    },
    {
      label: "Peak day pattern",
      insight: `${DOW_NAMES[peakDow]} is the strongest sales day historically ($${avgSalesByDow[peakDow].toFixed(0)} avg).`,
      impactPct: weekdayAvg > 0 ? ((avgSalesByDow[peakDow] - weekdayAvg) / weekdayAvg) * 100 : 0,
    },
  ];
  const seasonalNote =
    externalFactors[0]?.description ??
    (weekendLiftPct > 10
      ? "Weekend demand runs above weekday baseline — plan extra labor and inventory."
      : "Monitor weekend and weather-driven demand shifts.");

  const byMenuItemSorted = Object.values(itemSales).sort((a, b) => b.sales - a.sales);
  const byHourSorted = Object.entries(hourMap)
    .map(([hour, v]) => ({ hour: Number(hour), ...v }))
    .sort((a, b) => a.hour - b.hour);
  const byDaypartSorted = (["breakfast", "lunch", "dinner", "late"] as Daypart[]).map((dp) => ({
    daypart: dp,
    ...daypartMap[dp],
  }));
  const byChannelSorted = Object.entries(channelMap)
    .map(([channel, v]) => ({
      channel,
      sales: v.sales,
      profit: v.profit,
      orders: v.orders,
      marginPct: v.sales > 0 ? (v.profit / v.sales) * 100 : 0,
    }))
    .sort((a, b) => b.profit - a.profit);

  const salesHighlights = {
    topSellingItem: byMenuItemSorted[0] ?? null,
    busiestDaypart: byDaypartSorted.reduce(
      (best, d) => (!best || d.orders > best.orders ? d : best),
      null as (typeof byDaypartSorted)[number] | null
    ),
    busiestHour: byHourSorted.reduce(
      (best, h) => (!best || h.orders > best.orders ? h : best),
      null as (typeof byHourSorted)[number] | null
    ),
    mostProfitableChannel: byChannelSorted[0] ?? null,
    highestVolumeChannel: [...byChannelSorted].sort((a, b) => b.sales - a.sales)[0] ?? null,
  };

  const inventoryCounts = inventory
    .map((i) => ({
      name: i.name,
      quantity: i.quantity,
      unit: i.unit,
      costPerUnit: i.costPerUnit,
      valuation: i.quantity * i.costPerUnit,
      supplier: i.supplier,
      portionSize: i.portionSize,
      portionCost: portionCostFromItem({
        costPerUnit: i.costPerUnit,
        portionSize: i.portionSize,
        yieldPct: i.yieldPct ?? 100,
      }),
      yieldPct: i.yieldPct ?? 100,
    }))
    .sort((a, b) => b.valuation - a.valuation);

  const recipeCosts = menuItems
    .map((m) => {
      const rc = m.recipeCost || m.price * 0.28;
      return {
        name: m.name,
        category: m.category,
        price: m.price,
        recipeCost: rc,
        recipeCostPct: m.price > 0 ? (rc / m.price) * 100 : 0,
      };
    })
    .sort((a, b) => b.recipeCost - a.recipeCost);

  const wasteByReasonMap: Record<string, { cost: number; quantity: number }> = {};
  for (const w of waste) {
    if (!wasteByReasonMap[w.reason]) wasteByReasonMap[w.reason] = { cost: 0, quantity: 0 };
    wasteByReasonMap[w.reason].cost += w.cost;
    wasteByReasonMap[w.reason].quantity += w.quantity;
  }
  const wasteByReason = Object.entries(wasteByReasonMap)
    .map(([reason, v]) => ({ reason, ...v }))
    .sort((a, b) => b.cost - a.cost);

  const invoiceByVendor: Record<string, typeof vendorInvoices> = {};
  for (const inv of vendorInvoices) {
    if (!invoiceByVendor[inv.vendor]) invoiceByVendor[inv.vendor] = [];
    invoiceByVendor[inv.vendor].push(inv);
  }
  const pricingChanges = Object.entries(invoiceByVendor)
    .map(([vendor, invoices]) => {
      const latest = invoices[invoices.length - 1]!;
      const invoiceTrend = invoices.map((inv) => ({
        date: dateKey(inv.invoiceDate),
        amount: inv.amount,
        changePct: inv.priceChangePct,
      }));
      const priceTrend = vendorPriceHistory
        .filter((ph) => ph.vendor === vendor)
        .map((ph) => ({
          date: dateKey(ph.effectiveDate),
          unitPrice: ph.unitPrice,
          changePct: 0,
        }));
      const trend = [...invoiceTrend, ...priceTrend].sort((a, b) => a.date.localeCompare(b.date));
      return {
        vendor,
        category: latest.category,
        latestChangePct: latest.priceChangePct,
        trend,
      };
    })
    .sort((a, b) => b.latestChangePct - a.latestChangePct);

  const latestByItemVendor: Record<
    string,
    { itemName: string; vendor: string; unitPrice: number; unit: string; category: string }
  > = {};
  for (const ph of vendorPriceHistory) {
    const key = `${ph.itemName}::${ph.vendor}`;
    latestByItemVendor[key] = {
      itemName: ph.itemName,
      vendor: ph.vendor,
      unitPrice: ph.unitPrice,
      unit: ph.unit,
      category: ph.category,
    };
  }
  const pricesByItem: Record<
    string,
    Array<{ vendor: string; unitPrice: number; unit: string; category: string }>
  > = {};
  for (const entry of Object.values(latestByItemVendor)) {
    if (!pricesByItem[entry.itemName]) pricesByItem[entry.itemName] = [];
    pricesByItem[entry.itemName].push({
      vendor: entry.vendor,
      unitPrice: entry.unitPrice,
      unit: entry.unit,
      category: entry.category,
    });
  }

  const vendorComparison = inventory
    .map((invItem) => {
      const matchKey =
        Object.keys(pricesByItem).find(
          (k) =>
            k.toLowerCase().includes(invItem.name.toLowerCase().split(" ")[0]!) ||
            invItem.name.toLowerCase().includes(k.toLowerCase().split(" ")[0]!)
        ) ?? (pricesByItem[invItem.name] ? invItem.name : null);
      if (!matchKey || !pricesByItem[matchKey] || pricesByItem[matchKey].length < 2) return null;

      const vendors = [...pricesByItem[matchKey]].sort((a, b) => a.unitPrice - b.unitPrice);
      const cheapest = vendors[0]!;
      const currentVendor = invItem.supplier;
      const currentPrice = invItem.costPerUnit;
      const savingsPct =
        currentPrice > 0 ? ((currentPrice - cheapest.unitPrice) / currentPrice) * 100 : 0;

      return {
        itemName: invItem.name,
        category: vendors[0]!.category,
        currentVendor,
        currentPrice,
        cheapestVendor: cheapest.vendor,
        cheapestPrice: cheapest.unitPrice,
        potentialSavingsPct: Math.max(0, savingsPct),
        vendors: vendors.map((v) => ({
          ...v,
          isCurrent: v.vendor === currentVendor,
        })),
      };
    })
    .filter((v): v is NonNullable<typeof v> => v !== null)
    .sort((a, b) => b.potentialSavingsPct - a.potentialSavingsPct);

  const topCostDrivers = inventory
    .map((i) => ({
      name: i.name,
      cost: i.quantity * i.costPerUnit,
      changePct: vendorInvoices
        .filter((v) => v.vendor === i.supplier)
        .reduce((s, v) => s + v.priceChangePct, 0),
    }))
    .sort((a, b) => b.cost - a.cost)
    .slice(0, 8);

  const costIncreaseDrivers = [...topCostDrivers]
    .filter((i) => i.changePct > 0)
    .sort((a, b) => b.changePct - a.changePct)
    .slice(0, 5);

  const cheaperOpportunity = vendorComparison.find(
    (v) => v.potentialSavingsPct > 2 && v.currentVendor !== v.cheapestVendor
  );

  const topWaste = wasteByReason[0];
  const primaryDisappearingCause = topWaste
    ? topWaste.reason
    : Math.abs(variancePct) > 2
      ? "food cost variance"
      : spoilageCost > 0
        ? "spoilage"
        : "no significant loss detected";

  const recipeDriftItem =
    recipeCosts.find((r) => r.recipeCostPct > 35)?.name ??
    [...recipeCosts].sort((a, b) => b.recipeCostPct - a.recipeCostPct)[0]?.name ??
    null;

  const recipeStatus: FoodCostHighlights["recipeCompliance"]["status"] =
    Math.abs(variancePct) <= 2
      ? "on_track"
      : variancePct < -2
        ? "drift"
        : "favorable";

  const foodCostHighlights = {
    foodCostPct,
    variancePct,
    inventoryTurnover,
    daysOnHand,
    topWasteReason: wasteByReason[0]?.reason ?? null,
    vendorWithHighestIncrease: pricingChanges[0]
      ? { vendor: pricingChanges[0].vendor, changePct: pricingChanges[0].latestChangePct }
      : null,
    cheaperVendorOpportunity: cheaperOpportunity
      ? {
          itemName: cheaperOpportunity.itemName,
          currentVendor: cheaperOpportunity.currentVendor ?? "Unknown",
          alternativeVendor: cheaperOpportunity.cheapestVendor,
          savingsPct: cheaperOpportunity.potentialSavingsPct,
        }
      : null,
    productDisappearing: {
      primaryCause: primaryDisappearingCause,
      wasteCost,
      spoilageCost,
      varianceGapPct: variancePct,
    },
    costIncreaseDrivers,
    recipeCompliance: {
      status: recipeStatus,
      theoreticalPct: theoreticalFoodCostPct,
      actualPct: foodCostPct,
      variancePct,
      topDriftItem: recipeDriftItem,
    },
  };

  const laborHourMap: Record<number, { laborHours: number; laborCost: number }> = {};
  for (const sh of shifts) {
    const startH = hourFromTime(sh.startTime);
    const endH = hourFromTime(sh.endTime);
    const endHour = endH <= startH ? endH + 24 : endH;
    const rate = sh.staffMember?.hourlyRate ?? 0;
    for (let h = startH; h < endHour; h++) {
      const hour = h % 24;
      if (!laborHourMap[hour]) laborHourMap[hour] = { laborHours: 0, laborCost: 0 };
      laborHourMap[hour].laborHours += 1;
      laborHourMap[hour].laborCost += rate;
    }
  }

  const salesHourKeys = new Set([
    ...Object.keys(hourMap).map(Number),
    ...Object.keys(laborHourMap).map(Number),
  ]);
  const bySalesHour = [...salesHourKeys]
    .sort((a, b) => a - b)
    .map((hour) => {
      const labor = laborHourMap[hour] ?? { laborHours: 0, laborCost: 0 };
      const sales = hourMap[hour]?.sales ?? 0;
      return {
        hour,
        label: formatHourLabel(hour),
        laborHours: labor.laborHours,
        laborCost: labor.laborCost,
        sales,
        salesPerLaborHour: labor.laborHours > 0 ? sales / labor.laborHours : 0,
      };
    });

  const shiftLaborByDaypart: Record<Daypart, { hours: number; laborCost: number }> = {
    breakfast: { hours: 0, laborCost: 0 },
    lunch: { hours: 0, laborCost: 0 },
    dinner: { hours: 0, laborCost: 0 },
    late: { hours: 0, laborCost: 0 },
  };
  for (const sh of shifts) {
    const hrs = shiftHours(sh.startTime, sh.endTime);
    const cost = hrs * (sh.staffMember?.hourlyRate ?? 0);
    const dp = daypartFromHour(hourFromTime(sh.startTime));
    shiftLaborByDaypart[dp].hours += hrs;
    shiftLaborByDaypart[dp].laborCost += cost;
  }

  const byShift = (["breakfast", "lunch", "dinner", "late"] as const).map((label) => ({
    label,
    hours: shiftLaborByDaypart[label].hours,
    laborCost: shiftLaborByDaypart[label].laborCost,
    sales: daypartMap[label].sales,
    salesPerLaborHour:
      shiftLaborByDaypart[label].hours > 0
        ? daypartMap[label].sales / shiftLaborByDaypart[label].hours
        : 0,
    laborPct:
      daypartMap[label].sales > 0
        ? (shiftLaborByDaypart[label].laborCost / daypartMap[label].sales) * 100
        : 0,
  }));

  const byEmployee = staff
    .map((s) => {
      const staffShifts = shifts.filter((sh) => sh.staffMemberId === s.id);
      const schedHrs = staffShifts.reduce(
        (sum, sh) => sum + shiftHours(sh.startTime, sh.endTime),
        0
      );
      const actHrs = schedHrs * 0.98;
      const cost = schedHrs * s.hourlyRate;
      const share = scheduledHours > 0 ? schedHrs / scheduledHours : 0;
      const salesAttributed = netSales * share;
      const guestsAttributed = guestCount * share;
      return {
        name: s.name,
        role: s.role,
        scheduledHours: schedHrs,
        actualHours: actHrs,
        laborCost: cost,
        salesAttributed,
        salesPerLaborHour: actHrs > 0 ? salesAttributed / actHrs : 0,
        guestsPerLaborHour: actHrs > 0 ? guestsAttributed / actHrs : 0,
      };
    })
    .filter((e) => e.scheduledHours > 0)
    .sort((a, b) => b.salesPerLaborHour - a.salesPerLaborHour);

  const targetLaborPct = 28;
  const targetSalesPerLaborHour = revenuePerLaborHour > 0 ? revenuePerLaborHour : 100;
  const busiestHourEntry = Object.entries(hourMap).sort((a, b) => b[1].sales - a[1].sales)[0];
  const busiestHourNum = busiestHourEntry ? Number(busiestHourEntry[0]) : null;
  const peakLaborHours = busiestHourNum !== null ? (laborHourMap[busiestHourNum]?.laborHours ?? 0) : 0;
  const avgLaborInSalesHours =
    bySalesHour.filter((h) => h.sales > 0).length > 0
      ? bySalesHour.filter((h) => h.sales > 0).reduce((s, h) => s + h.laborHours, 0) /
        bySalesHour.filter((h) => h.sales > 0).length
      : 0;

  let staffingStatus: LaborHighlights["staffingStatus"] = "balanced";
  let staffingReason = "Labor % and sales per labor hour are within target range.";
  if (laborPct > targetLaborPct + 3 && revenuePerLaborHour < targetSalesPerLaborHour * 0.85) {
    staffingStatus = "overstaffed";
    staffingReason = `Labor at ${laborPct.toFixed(1)}% with sales/labor hr $${revenuePerLaborHour.toFixed(0)} below target — trim low-traffic shifts.`;
  } else if (
    laborPct < targetLaborPct - 4 ||
    (busiestHourNum !== null &&
      peakLaborHours < avgLaborInSalesHours * 0.65 &&
      (hourMap[busiestHourNum]?.sales ?? 0) > netSales * 0.08)
  ) {
    staffingStatus = "understaffed";
    const gplh = actualHours > 0 ? guestCount / actualHours : 0;
    staffingReason =
      busiestHourNum !== null && peakLaborHours < avgLaborInSalesHours * 0.65
        ? `Peak hour ${formatHourLabel(busiestHourNum)} has high sales but only ${peakLaborHours} labor hours scheduled.`
        : `Labor at ${laborPct.toFixed(1)}% — below target with ${gplh.toFixed(1)} guests per labor hour.`;
  }

  const inefficientShifts = [...byShift]
    .filter((s) => s.hours > 0)
    .sort((a, b) => a.salesPerLaborHour - b.salesPerLaborHour)
    .slice(0, 3)
    .map((s) => ({
      label: s.label,
      salesPerLaborHour: s.salesPerLaborHour,
      laborPct: s.laborPct,
    }));

  const laborHighlights: LaborHighlights = {
    staffingStatus,
    staffingReason,
    inefficientShifts,
    topPerformers: byEmployee.slice(0, 5).map((e) => ({
      name: e.name,
      role: e.role,
      salesPerLaborHour: e.salesPerLaborHour,
      guestsPerLaborHour: e.guestsPerLaborHour,
    })),
  };

  const starBuckets = [1, 2, 3, 4, 5].map((stars) => {
    const count = reviews.filter((r) => Math.round(r.rating) === stars).length;
    return {
      stars,
      count,
      pct: reviews.length > 0 ? (count / reviews.length) * 100 : 0,
    };
  });

  const bySource = Object.entries(
    reviews.reduce(
      (acc, r) => {
        if (!acc[r.source]) acc[r.source] = { count: 0, total: 0 };
        acc[r.source].count += 1;
        acc[r.source].total += r.rating;
        return acc;
      },
      {} as Record<string, { count: number; total: number }>
    )
  ).map(([source, v]) => ({
    source,
    count: v.count,
    avgRating: v.total / v.count,
  }));

  const complaintCategories = Object.entries(
    reviews
      .filter((r) => r.category)
      .reduce(
        (acc, r) => {
          const cat = r.category!;
          acc[cat] = (acc[cat] ?? 0) + 1;
          return acc;
        },
        {} as Record<string, number>
      )
  )
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count);

  const surveyResults = complaintCategories.map((c) => {
    const catReviews = reviews.filter((r) => r.category === c.category);
    const avgScore =
      catReviews.length > 0
        ? catReviews.reduce((s, r) => s + r.rating, 0) / catReviews.length
        : 0;
    const satisfiedPct =
      catReviews.length > 0
        ? (catReviews.filter((r) => r.rating >= 4).length / catReviews.length) * 100
        : 0;
    return {
      category: c.category,
      responses: c.count,
      avgScore,
      satisfiedPct,
    };
  });

  const negativeReviews = reviews.filter((r) => r.rating < 4);
  const sentiment = {
    positive: reviews.filter((r) => r.rating >= 4).length,
    neutral: reviews.filter((r) => r.rating >= 3 && r.rating < 4).length,
    negative: reviews.filter((r) => r.rating < 3).length,
  };

  const msPerDay = 86400000;
  const resolvedReviews = reviews.filter((r) => r.resolved);
  const unresolvedNegative = reviews.filter((r) => !r.resolved && r.rating < 4);
  const resolutionTimes = {
    avgDaysToResolve:
      resolvedReviews.length > 0
        ? resolvedReviews.reduce((s, r) => s + 1.5, 0) / resolvedReviews.length
        : 0,
    unresolvedAvgDays:
      unresolvedNegative.length > 0
        ? unresolvedNegative.reduce(
            (s, r) => s + (now.getTime() - r.createdAt.getTime()) / msPerDay,
            0
          ) / unresolvedNegative.length
        : 0,
    resolvedCount: resolvedReviews.length,
    unresolvedCount: unresolvedNegative.length,
  };

  const daypartComplaints: Record<
    Daypart,
    { count: number; totalRating: number; categories: Record<string, number> }
  > = {
    breakfast: { count: 0, totalRating: 0, categories: {} },
    lunch: { count: 0, totalRating: 0, categories: {} },
    dinner: { count: 0, totalRating: 0, categories: {} },
    late: { count: 0, totalRating: 0, categories: {} },
  };
  for (const r of negativeReviews) {
    const dp = daypartFromHour(r.createdAt.getHours());
    daypartComplaints[dp].count += 1;
    daypartComplaints[dp].totalRating += r.rating;
    if (r.category) {
      daypartComplaints[dp].categories[r.category] =
        (daypartComplaints[dp].categories[r.category] ?? 0) + 1;
    }
  }

  const complaintsByDaypart = (["breakfast", "lunch", "dinner", "late"] as const).map((daypart) => {
    const d = daypartComplaints[daypart];
    const topCategory =
      Object.entries(d.categories).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    return {
      daypart,
      negativeCount: d.count,
      avgRating: d.count > 0 ? d.totalRating / d.count : 0,
      topCategory,
    };
  });

  const googleReviewList = reviews.filter((r) => /google/i.test(r.source));
  const openTableReviewList = reviews.filter((r) => /opentable/i.test(r.source));

  const mapSourceMonitor = (list: typeof reviews) => ({
    count: list.length,
    avgRating:
      list.length > 0 ? list.reduce((s, r) => s + r.rating, 0) / list.length : 0,
    unresolved: list.filter((r) => !r.resolved && r.rating < 4).length,
    recent: list.slice(0, 5).map((r) => ({
      rating: r.rating,
      comment: r.comment,
      date: r.createdAt.toISOString(),
    })),
  });

  const satisfactionHurts = [
    ...complaintCategories.slice(0, 4).map((c) => {
      const catReviews = reviews.filter((r) => r.category === c.category);
      const avg =
        catReviews.length > 0
          ? catReviews.reduce((s, r) => s + r.rating, 0) / catReviews.length
          : 0;
      return { issue: c.category, count: c.count, avgRating: avg };
    }),
    ...bySource
      .filter((s) => s.avgRating < 4)
      .map((s) => ({ issue: `${s.source} reviews`, count: s.count, avgRating: s.avgRating })),
  ].slice(0, 5);

  const complaintHotspots = complaintsByDaypart
    .filter((d) => d.negativeCount > 0)
    .sort((a, b) => b.negativeCount - a.negativeCount)
    .map((d) => ({
      label: d.daypart,
      type: "daypart" as const,
      count: d.negativeCount,
      topCategory: d.topCategory,
    }));

  const sentimentOverall: CustomerExperienceHighlights["sentimentSummary"]["overall"] =
    sentiment.negative > sentiment.positive
      ? "negative"
      : sentiment.positive > sentiment.negative * 2
        ? "positive"
        : "mixed";

  const customerHighlights: CustomerExperienceHighlights = {
    satisfactionHurts,
    complaintHotspots,
    sentimentSummary: {
      ...sentiment,
      overall: sentimentOverall,
    },
  };

  const totalDiscountAmount = paidOrders.reduce((s, o) => s + o.discountAmount, 0);
  const totalCompAmount = paidOrders.reduce((s, o) => s + o.compAmount, 0);
  const avgKitchenProductionMinutes = avgTicketTime * 0.65;

  const ticketByDaypart: Record<Daypart, { totalMinutes: number; count: number }> = {
    breakfast: { totalMinutes: 0, count: 0 },
    lunch: { totalMinutes: 0, count: 0 },
    dinner: { totalMinutes: 0, count: 0 },
    late: { totalMinutes: 0, count: 0 },
  };
  const ticketByHour: Record<number, { totalMinutes: number; count: number }> = {};

  for (const o of ticketTimes) {
    const hour = o.createdAt.getHours();
    const dp = daypartFromHour(hour);
    ticketByDaypart[dp].totalMinutes += o.ticketTimeMinutes!;
    ticketByDaypart[dp].count += 1;
    if (!ticketByHour[hour]) ticketByHour[hour] = { totalMinutes: 0, count: 0 };
    ticketByHour[hour].totalMinutes += o.ticketTimeMinutes!;
    ticketByHour[hour].count += 1;
  }

  const ticketTimesByDaypart = (["breakfast", "lunch", "dinner", "late"] as const).map((daypart) => {
    const d = ticketByDaypart[daypart];
    return {
      daypart,
      avgMinutes: d.count > 0 ? d.totalMinutes / d.count : 0,
      orders: d.count,
    };
  });

  const ticketTimesByHour = Object.entries(ticketByHour)
    .map(([hour, d]) => ({
      hour: Number(hour),
      label: formatHourLabel(Number(hour)),
      avgMinutes: d.count > 0 ? d.totalMinutes / d.count : 0,
      orders: d.count,
    }))
    .sort((a, b) => a.hour - b.hour);

  const bottleneckDaypart =
    [...ticketTimesByDaypart]
      .filter((d) => d.orders > 0)
      .sort((a, b) => b.avgMinutes - a.avgMinutes)[0]?.daypart ??
    Object.entries(daypartMap).sort((a, b) => b[1].orders - a[1].orders)[0]?.[0] ??
    "dinner";

  const bottlenecks = [
    ...ticketTimesByDaypart
      .filter((d) => d.orders > 0)
      .sort((a, b) => b.avgMinutes - a.avgMinutes)
      .slice(0, 2)
      .map((d) => ({
        label: d.daypart,
        type: "daypart" as const,
        avgTicketMinutes: d.avgMinutes,
        orders: d.orders,
      })),
    ...ticketTimesByHour
      .filter((h) => h.orders >= 2)
      .sort((a, b) => b.avgMinutes - a.avgMinutes)
      .slice(0, 2)
      .map((h) => ({
        label: h.label,
        type: "hour" as const,
        avgTicketMinutes: h.avgMinutes,
        orders: h.orders,
      })),
  ];

  const slowThreshold = 25;
  const slowOrderPct =
    ticketTimes.length > 0
      ? (ticketTimes.filter((o) => o.ticketTimeMinutes! > slowThreshold).length / ticketTimes.length) * 100
      : 0;
  const waitComplaints = reviews.filter((r) => r.category === "wait_time").length;

  let ticketTimeStatus: OperationsHighlights["ticketTimeImpact"]["status"] = "no_data";
  let ticketTimeReason = "Insufficient ticket time data to assess sales impact.";
  if (ticketTimes.length > 0) {
    if (avgTicketTime > 22 && (slowOrderPct > 20 || waitComplaints > 0)) {
      ticketTimeStatus = "hurting";
      ticketTimeReason = `Avg ticket ${avgTicketTime.toFixed(0)} min with ${slowOrderPct.toFixed(0)}% of orders over ${slowThreshold} min${waitComplaints > 0 ? ` and ${waitComplaints} wait-time complaints` : ""} — likely suppressing throughput and guest satisfaction.`;
    } else {
      ticketTimeStatus = "manageable";
      ticketTimeReason = `Avg ticket ${avgTicketTime.toFixed(0)} min — within target range for current volume.`;
    }
  }

  const operationsHighlights: OperationsHighlights = {
    bottlenecks,
    ticketTimeImpact: {
      status: ticketTimeStatus,
      reason: ticketTimeReason,
      slowOrderPct,
      avgTicketTimeMinutes: avgTicketTime,
    },
  };

  const purchasingTotal = vendorInvoices.reduce((s, v) => s + v.amount, 0);
  const purchasingInflation =
    vendorInvoices.length > 0
      ? vendorInvoices.reduce((s, v) => s + v.priceChangePct, 0) / vendorInvoices.length
      : 0;
  const costIncreaseSuppliers = Object.entries(
    vendorInvoices.reduce(
      (acc, v) => {
        if (v.priceChangePct <= 0) return acc;
        if (!acc[v.vendor]) acc[v.vendor] = { changePct: 0, spend: 0, count: 0 };
        acc[v.vendor].changePct += v.priceChangePct;
        acc[v.vendor].spend += v.amount;
        acc[v.vendor].count += 1;
        return acc;
      },
      {} as Record<string, { changePct: number; spend: number; count: number }>
    )
  )
    .map(([vendor, d]) => ({
      vendor,
      changePct: d.changePct / d.count,
      spend: d.spend,
    }))
    .sort((a, b) => b.changePct - a.changePct);

  const aboveMarketVendors = vendorComparison.filter((v) => v.potentialSavingsPct > 3);
  const multiVendorBids = vendorBidsForPurchasing.filter((b) => b.vendors.length >= 2);
  const biddingSavings = multiVendorBids.reduce(
    (s, b) => s + b.savingsAmount * Math.max(b.suggestedQty, 1),
    0
  );
  const topBid = multiVendorBids.sort((a, b) => b.savingsPct - a.savingsPct)[0] ?? null;

  const { vendorEdiProviderLabel } = await import("@/lib/integrations/providers");
  const ediCatalogSummaries = vendorEdiConnections.map((c) => ({
    name: vendorEdiProviderLabel(c.provider),
    connected: c.connected,
    catalogItems: c.catalogItemsCount,
    outOfStock: 0,
  }));

  let threeWaySummary = {
    invoices: [] as Awaited<ReturnType<typeof import("@/lib/purchasing/three-way-match").getThreeWayMatchSummary>>["invoices"],
    discrepancyCount: 0,
    holdPaymentTotal: 0,
    pendingCount: 0,
    matchedCount: 0,
  };
  try {
    const { getThreeWayMatchSummary } = await import("@/lib/purchasing/three-way-match");
    threeWaySummary = await getThreeWayMatchSummary(locationId);
  } catch {
    /* optional */
  }

  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const ocrInvoicesThisMonth = await prisma.vendorInvoice.count({
    where: { locationId, createdAt: { gte: monthStart } },
  });
  const priceSpikeInsights = await prisma.businessInsight.findMany({
    where: {
      locationId,
      resolved: false,
      title: { startsWith: "Price spike:" },
      createdAt: { gte: new Date(now.getTime() - 14 * 86400000) },
    },
    orderBy: { createdAt: "desc" },
    take: 5,
  });
  const catchWeightInsights = await prisma.businessInsight.findMany({
    where: {
      locationId,
      resolved: false,
      title: { startsWith: "Catch weight:" },
    },
    take: 5,
  });
  let topSpike: { item: string; changePct: number; vendor: string } | null = null;
  if (priceSpikeInsights[0]) {
    try {
      const snap = JSON.parse(priceSpikeInsights[0].dataSnapshot ?? "{}") as {
        item?: string;
        changePct?: number;
        vendor?: string;
      };
      topSpike = {
        item: snap.item ?? priceSpikeInsights[0].title.replace("Price spike: ", ""),
        changePct: snap.changePct ?? 0,
        vendor: snap.vendor ?? "",
      };
    } catch {
      /* ignore */
    }
  }

  const purchasingHighlights: PurchasingHighlights = {
    costIncreaseSuppliers: costIncreaseSuppliers.slice(0, 5),
    marketRateStatus: {
      status:
        aboveMarketVendors.length > 2
          ? "above"
          : purchasingInflation > 4
            ? "above"
            : purchasingInflation < 1
              ? "below"
              : vendorInvoices.length > 0
                ? "at"
                : "unknown",
      reason:
        aboveMarketVendors.length > 0
          ? `${aboveMarketVendors.length} items have cheaper vendor alternatives — avg inflation ${purchasingInflation.toFixed(1)}%.`
          : purchasingInflation > 4
            ? `Vendor inflation at ${purchasingInflation.toFixed(1)}% — renegotiate or switch suppliers.`
            : vendorInvoices.length > 0
              ? `Paying near market rates with ${purchasingInflation.toFixed(1)}% avg inflation.`
              : "No vendor invoice data to compare rates.",
    },
    smartOrdering: {
      draftPoCount: draftPurchaseOrders.length,
      draftPoTotal: draftPurchaseOrders.reduce((s, d) => s + d.totalAmount, 0),
      autoBuiltVendors: new Set(draftPurchaseOrders.map((d) => d.vendor)).size,
    },
    vendorBidding: {
      multiVendorItems: multiVendorBids.length,
      estimatedWeeklySavings: Math.round(biddingSavings * 100) / 100,
      topOpportunity: topBid
        ? {
            itemName: topBid.itemName,
            vendor: topBid.recommendedVendor,
            savingsPct: topBid.savingsPct,
          }
        : null,
    },
    ediCatalogs: ediCatalogSummaries,
    threeWayMatch: {
      discrepancyCount: threeWaySummary.discrepancyCount,
      holdPaymentTotal: threeWaySummary.holdPaymentTotal,
      pendingCount: threeWaySummary.pendingCount,
      matchedCount: threeWaySummary.matchedCount,
      openIssues: threeWaySummary.invoices
        .filter((s) => s.matchStatus === "DISCREPANCY")
        .slice(0, 5)
        .map((s) => ({ vendor: s.vendor, issue: s.topIssue ?? s.summary, exposure: s.exposureTotal })),
    },
    invoiceDigitization: {
      ocrInvoicesThisMonth,
      recentPriceSpikes: priceSpikeInsights.length,
      catchWeightAlerts: catchWeightInsights.length,
      topSpike,
      openCatchWeightIssues: catchWeightInsights.map((i) => ({
        item: i.title.replace("Catch weight: ", ""),
        description: i.description,
      })),
    },
  };

  let creditMemoSummary: Awaited<ReturnType<typeof import("@/lib/purchasing/credit-memo").getCreditMemoSummary>> = {
    openCount: 0,
    openTotal: 0,
    appliedYtdTotal: 0,
    accountingLockedCount: 0,
    lockedInvoiceExposure: 0,
    lockedInvoices: [],
    recentOpen: [],
  };
  try {
    const { getCreditMemoSummary } = await import("@/lib/purchasing/credit-memo");
    creditMemoSummary = await getCreditMemoSummary(locationId);
  } catch {
    /* optional */
  }

  purchasingHighlights.creditMemoTracking = {
    openCount: creditMemoSummary.openCount,
    openTotal: creditMemoSummary.openTotal,
    appliedYtdTotal: creditMemoSummary.appliedYtdTotal,
    accountingLockedCount: creditMemoSummary.accountingLockedCount,
    lockedInvoiceExposure: creditMemoSummary.lockedInvoiceExposure,
    recentOpen: creditMemoSummary.recentOpen.map((c) => ({
      vendor: c.vendor,
      amount: c.amount,
      reason: c.reason,
      emailStatus: c.emailStatus,
    })),
  };

  try {
    const { getVendorScorecardSummary } = await import("@/lib/purchasing/vendor-scorecards");
    const scSummary = await getVendorScorecardSummary(locationId);
    purchasingHighlights.vendorScorecards = {
      vendorCount: scSummary.vendorCount,
      avgFillRate: scSummary.avgFillRate,
      avgOnTime: scSummary.avgOnTime,
      avgSubstitutionRate: scSummary.avgSubstitutionRate,
      bestVendor: scSummary.bestVendor
        ? {
            vendor: scSummary.bestVendor.vendor,
            reliabilityGrade: scSummary.bestVendor.reliabilityGrade,
            reliabilityScore: scSummary.bestVendor.reliabilityScore,
          }
        : null,
      worstVendor: scSummary.worstVendor
        ? {
            vendor: scSummary.worstVendor.vendor,
            reliabilityGrade: scSummary.worstVendor.reliabilityGrade,
            reliabilityScore: scSummary.worstVendor.reliabilityScore,
            fillRatePct: scSummary.worstVendor.fillRatePct,
            onTimePct: scSummary.worstVendor.onTimePct,
            substitutionRatePct: scSummary.worstVendor.substitutionRatePct,
          }
        : null,
      topVendors: scSummary.scorecards.slice(0, 6).map((c) => ({
        vendor: c.vendor,
        fillRatePct: c.fillRatePct,
        onTimePct: c.onTimePct,
        substitutionRatePct: c.substitutionRatePct,
        reliabilityGrade: c.reliabilityGrade,
        reliabilityScore: c.reliabilityScore,
      })),
    };
  } catch {
    /* optional */
  }

  try {
    const { getPoReceivingSummary } = await import("@/lib/purchasing/po-receiving-summary");
    const poRecv = await getPoReceivingSummary(locationId);
    purchasingHighlights.poReceiving = {
      pendingCount: poRecv.pendingCount,
      receivedCount: poRecv.receivedCount,
      pendingTotal: poRecv.pendingTotal,
      receivedTotal: poRecv.receivedTotal,
      paidCount: poRecv.paidCount,
      onHoldCount: poRecv.onHoldCount,
      awaitingInvoiceCount: poRecv.awaitingInvoiceCount,
      approvedCount: poRecv.approvedCount,
      orders: poRecv.orders.slice(0, 12).map((o) => ({
        poNumber: o.poNumber,
        vendor: o.vendor,
        status: o.status,
        totalAmount: o.totalAmount,
        receivingGroup: o.receivingGroup,
        paymentStatus: o.paymentStatus,
        paymentDetail: o.paymentDetail,
      })),
    };
  } catch {
    /* optional */
  }

  const nextFriday = new Date(now);
  const daysUntilFriday = ((5 - nextFriday.getDay() + 7) % 7) || 7;
  nextFriday.setDate(nextFriday.getDate() + daysUntilFriday);
  const nextFridayKey = dateKey(nextFriday);
  const fridaySalesForecast = salesForecast7d.find((f) => f.date === nextFridayKey);
  const fridayLaborForecast = laborHoursForecast7d.find((f) => f.date === nextFridayKey);

  const tomorrowForecast = salesForecast7d[0];
  const tomorrowSales = tomorrowForecast?.predicted ?? avgDailySales;
  const tomorrowDate =
    tomorrowForecast?.date ??
    dateKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));
  const tomorrowSalesRatio = avgDailySales > 0 ? tomorrowSales / avgDailySales : 1;

  const inventoryOrderTomorrow = inventory
    .map((i) => {
      const targetStock = Math.max(
        i.minQuantity * 1.5,
        Math.ceil(i.minQuantity * tomorrowSalesRatio * 1.2)
      );
      const quantity = Math.max(0, Math.ceil(targetStock - i.quantity));
      return {
        name: i.name,
        quantity,
        unit: i.unit,
        onHand: i.quantity,
      };
    })
    .sort((a, b) => b.quantity - a.quantity || a.name.localeCompare(b.name));

  const totalCateringForecast = cateringDemandForecast7d.reduce((s, d) => s + d.predictedSales, 0);
  const totalCateringOrders = cateringDemandForecast7d.reduce((s, d) => s + d.predictedOrders, 0);
  const cateringHist = channelMap["catering"];
  const cateringWeeklyBaseline = ((cateringHist?.sales ?? 0) / weeksInPeriod) * 7;
  const cateringTrend: ForecastingHighlights["cateringDemandNext7d"]["trend"] =
    totalCateringForecast > cateringWeeklyBaseline * 1.05
      ? "up"
      : totalCateringForecast < cateringWeeklyBaseline * 0.95
        ? "down"
        : "stable";

  const forecastingHighlights: ForecastingHighlights = {
    staffNeededNextFriday: {
      hours: fridayLaborForecast?.hours ?? scheduledHours / 7,
      predictedSales: fridaySalesForecast?.predicted ?? netSales / 7,
      date: nextFridayKey,
    },
    inventoryOrderDate: tomorrowDate,
    inventoryOrderTomorrow,
    cateringDemandNext7d: {
      orders: Math.round(totalCateringOrders),
      sales: totalCateringForecast,
      trend: cateringTrend,
    },
    seasonalTrend: {
      pattern: seasonalTrends[0]?.label ?? "Historical patterns",
      insight: seasonalTrends[0]?.insight ?? seasonalNote,
      peakDay: DOW_NAMES[peakDow] ?? "",
      liftPct: weekendLiftPct,
    },
  };

  const grossProfit = netSales - actualFoodCost;

  const byMenuItemProfit = menuEngineeringItems
    .map((m) => ({
      name: m.name,
      profit: m.contribution,
      marginPct: m.marginPct,
      sales: m.price * m.quantitySold,
    }))
    .sort((a, b) => b.profit - a.profit);

  const byCategoryProfit = Object.entries(categorySales)
    .map(([category, v]) => ({
      category,
      profit: categoryProfitMap[category] ?? 0,
      sales: v.sales,
      marginPct: v.sales > 0 ? ((categoryProfitMap[category] ?? 0) / v.sales) * 100 : 0,
    }))
    .sort((a, b) => b.profit - a.profit);

  const byEmployeeProfit = byEmployee
    .map((e) => {
      const profit = scheduledHours > 0 ? profitEstimate * (e.scheduledHours / scheduledHours) : 0;
      return {
        name: e.name,
        role: e.role,
        profit,
        sales: e.salesAttributed,
        marginPct: e.salesAttributed > 0 ? (profit / e.salesAttributed) * 100 : 0,
      };
    })
    .sort((a, b) => b.profit - a.profit);

  const byShiftProfit = (["breakfast", "lunch", "dinner", "late"] as Daypart[]).map((shift) => ({
    shift,
    sales: daypartMap[shift].sales,
    laborCost: shiftLaborByDaypart[shift].laborCost,
    profit: daypartProfitMap[shift],
    marginPct:
      daypartMap[shift].sales > 0 ? (daypartProfitMap[shift] / daypartMap[shift].sales) * 100 : 0,
  }));

  const byDaypartProfit = byShiftProfit.map((s) => ({
    daypart: s.shift,
    profit: s.profit,
    sales: s.sales,
    marginPct: s.marginPct,
  }));

  const byHourProfit = Object.entries(hourProfitMap)
    .map(([hour, profit]) => {
      const h = Number(hour);
      const sales = hourMap[h]?.sales ?? 0;
      return {
        hour: h,
        label: formatHourLabel(h),
        profit,
        sales,
        orders: hourMap[h]?.orders ?? 0,
      };
    })
    .sort((a, b) => a.hour - b.hour);

  const byDayProfit = Object.entries(dayProfit)
    .map(([date, profit]) => ({
      date,
      profit,
      sales: daySalesMap[date] ?? 0,
    }))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-14);

  const byChannelProfit = Object.entries(channelProfitMap)
    .map(([channel, profit]) => {
      const sales = channelMap[channel]?.sales ?? 0;
      return {
        channel,
        profit,
        sales,
        marginPct: sales > 0 ? (profit / sales) * 100 : 0,
      };
    })
    .sort((a, b) => b.profit - a.profit);

  const byDeliveryProviderProfit = Object.entries(channelProfitMap)
    .filter(([channel]) => isDeliveryChannel(channel))
    .map(([channel, profit]) => {
      const sales = channelMap[channel]?.sales ?? 0;
      const orders = channelMap[channel]?.orders ?? 0;
      return {
        provider: formatDeliveryProvider(channel),
        profit,
        sales,
        orders,
        marginPct: sales > 0 ? (profit / sales) * 100 : 0,
      };
    })
    .sort((a, b) => b.profit - a.profit);

  const byCampaignProfit = campaigns
    .map((c) => ({
      name: c.name,
      channel: c.channel,
      spend: c.spend,
      revenue: c.revenueAttributed,
      profit: c.revenueAttributed - c.spend,
      roiPct: c.spend > 0 ? ((c.revenueAttributed - c.spend) / c.spend) * 100 : 0,
    }))
    .sort((a, b) => b.profit - a.profit);

  const byLocationProfit = [
    {
      locationId,
      name: location?.name ?? "This location",
      profit: profitEstimate,
      sales: netSales,
      marginPct: netSales > 0 ? (profitEstimate / netSales) * 100 : 0,
    },
  ];

  const profitLeaks: ProfitabilityHighlights["profitLeaks"] = [];
  if (totalVoids > 0) {
    profitLeaks.push({ area: "Voids", amount: totalVoids, reason: "POS voids erode net margin" });
  }
  if (totalDiscountAmount > netSales * 0.05) {
    profitLeaks.push({
      area: "Discounts",
      amount: totalDiscountAmount,
      reason: "Discount rate exceeds 5% of sales",
    });
  }
  const dogItems = menuEngineeringItems.filter((m) => m.quadrant === "dog").slice(0, 2);
  for (const dog of dogItems) {
    profitLeaks.push({
      area: `Menu: ${dog.name}`,
      amount: dog.contribution,
      reason: "Low profit and low popularity item",
    });
  }

  const marginDrivers: ProfitabilityHighlights["marginDrivers"] = [
    ...byMenuItemProfit.slice(0, 2).map((m) => ({ name: m.name, type: "item" as const, profit: m.profit })),
    ...byCategoryProfit.slice(0, 1).map((c) => ({ name: c.category, type: "category" as const, profit: c.profit })),
    ...byEmployeeProfit.slice(0, 1).map((e) => ({ name: e.name, type: "employee" as const, profit: e.profit })),
    ...byShiftProfit.slice(0, 1).map((s) => ({ name: s.shift, type: "shift" as const, profit: s.profit })),
    ...byDaypartProfit.slice(0, 1).map((d) => ({ name: d.daypart, type: "daypart" as const, profit: d.profit })),
    ...byHourProfit
      .sort((a, b) => b.profit - a.profit)
      .slice(0, 1)
      .map((h) => ({ name: h.label, type: "hour" as const, profit: h.profit })),
    ...byDayProfit
      .sort((a, b) => b.profit - a.profit)
      .slice(0, 1)
      .map((d) => ({ name: d.date, type: "day" as const, profit: d.profit })),
    ...byChannelProfit.slice(0, 1).map((c) => ({ name: c.channel, type: "channel" as const, profit: c.profit })),
    ...byLocationProfit.slice(0, 1).map((l) => ({ name: l.name, type: "location" as const, profit: l.profit })),
    ...byDeliveryProviderProfit.slice(0, 1).map((d) => ({ name: d.provider, type: "delivery" as const, profit: d.profit })),
    ...byCampaignProfit.slice(0, 1).map((c) => ({ name: c.name, type: "campaign" as const, profit: c.profit })),
  ].sort((a, b) => b.profit - a.profit);

  const topProfitItem = byMenuItemProfit[0] ?? null;
  const topProfitHourEntry = [...byHourProfit].sort((a, b) => b.profit - a.profit)[0];
  const topProfitHour = topProfitHourEntry
    ? { hour: topProfitHourEntry.hour, label: topProfitHourEntry.label, profit: topProfitHourEntry.profit }
    : null;
  const topProfitDayEntry = [...byDayProfit].sort((a, b) => b.profit - a.profit)[0];
  const topProfitDay = topProfitDayEntry ? { date: topProfitDayEntry.date, profit: topProfitDayEntry.profit } : null;
  const topProfitEmployee = byEmployeeProfit[0]
    ? { name: byEmployeeProfit[0].name, profit: byEmployeeProfit[0].profit }
    : null;
  const topProfitChannel = byChannelProfit[0]
    ? { channel: byChannelProfit[0].channel, profit: byChannelProfit[0].profit }
    : null;
  const topCampaign = byCampaignProfit[0]
    ? { name: byCampaignProfit[0].name, profit: byCampaignProfit[0].profit }
    : null;
  const lowestProfitShiftEntry = [...byShiftProfit].sort((a, b) => a.profit - b.profit)[0];
  const lowestProfitShift = lowestProfitShiftEntry
    ? { shift: lowestProfitShiftEntry.shift, profit: lowestProfitShiftEntry.profit }
    : null;

  const profitabilityHighlights: ProfitabilityHighlights = {
    profitLeaks: profitLeaks.slice(0, 5),
    marginDrivers,
    topProfitItem,
    topProfitHour,
    topProfitDay,
    topProfitEmployee,
    topProfitChannel,
    topCampaign,
    lowestProfitShift,
  };

  const weatherFactors = externalFactors.filter((f) =>
    /weather|rain|snow|heat|forecast/i.test(`${f.factorType} ${f.description}`)
  );
  const eventFactors = externalFactors.filter((f) => {
    const cat = normalizeFactorCategory(f.factorType, f.description);
    return cat === "event" || cat === "holiday" || cat === "sports";
  });
  const tourismFactors = externalFactors.filter(
    (f) => normalizeFactorCategory(f.factorType, f.description) === "tourism"
  );
  const schoolFactors = externalFactors.filter(
    (f) => normalizeFactorCategory(f.factorType, f.description) === "school"
  );

  const patternSummaries = buildPatternSummaries(learnedPatterns);
  const deliveryPattern = learnedPatterns.find((p) => p.category === "weather" && p.metric === "delivery");

  let weatherForecast: WeatherForecastDay[] = [];
  let weatherSource = "";
  let weatherGeo: string | null = null;
  if (location) {
    const geo = await geocodeLocation(location.address, location.name);
    if (geo) {
      weatherGeo = geo.label;
      try {
        const w = await fetchWeatherForecast(geo.lat, geo.lon);
        weatherForecast = w.forecasts;
        weatherSource = w.source;
      } catch {
        weatherSource = "unavailable";
      }
    }
  }

  const externalByCategoryMap = new Map<string, { count: number; totalImpact: number }>();
  for (const f of externalFactors) {
    const cat = normalizeFactorCategory(f.factorType, f.description);
    const cur = externalByCategoryMap.get(cat) ?? { count: 0, totalImpact: 0 };
    cur.count += 1;
    cur.totalImpact += f.impactPct;
    externalByCategoryMap.set(cat, cur);
  }
  const externalByCategory = [...externalByCategoryMap.entries()].map(([category, v]) => ({
    category: category as ExternalFactorCategory,
    count: v.count,
    avgImpactPct: v.count > 0 ? v.totalImpact / v.count : 0,
  }));

  const tourismLevel: ExternalFactorsHighlights["tourismLevel"] =
    tourismFactors.length >= 2
      ? "high"
      : tourismFactors.length === 1
        ? "moderate"
        : learnedPatterns.some((p) => p.category === "tourism" && p.impactPct > 10)
          ? "moderate"
          : null;

  const schoolScheduleNote =
    schoolFactors.length > 0
      ? schoolFactors
          .slice(0, 2)
          .map((f) => f.description)
          .join("; ")
      : learnedPatterns.find((p) => p.category === "school")?.insight ?? null;

  const categoryCoverage = buildCategoryCoverage(
    externalByCategory,
    learnedPatterns,
    weatherForecast.length > 0
  );

  const externalHighlights: ExternalFactorsHighlights = {
    weatherImpact:
      weatherFactors.length > 0 || deliveryPattern
        ? {
            avgImpactPct:
              deliveryPattern?.impactPct ??
              (weatherFactors.length > 0
                ? weatherFactors.reduce((s, f) => s + f.impactPct, 0) / weatherFactors.length
                : 0),
            insight:
              deliveryPattern?.insight ??
              (weatherFactors.length > 0
                ? `Weather events avg ${(weatherFactors.reduce((s, f) => s + f.impactPct, 0) / weatherFactors.length).toFixed(0)}% impact on operations.`
                : "Connect weather to learn rain/delivery patterns."),
            deliveryShiftPct: deliveryPattern?.impactPct ?? null,
          }
        : null,
    topEvents: eventFactors
      .sort((a, b) => b.impactPct - a.impactPct)
      .slice(0, 6)
      .map((f) => ({
        description: f.description,
        impactPct: f.impactPct,
        category: normalizeFactorCategory(f.factorType, f.description),
      })),
    learnedPatterns,
    upcomingForecast: weatherForecast,
    tourismLevel,
    schoolScheduleNote,
    categoryCoverage,
  };

  const mergedAiInsights: AnalyticsInsight[] = [
    ...aiInsights,
    ...learnedPatterns.slice(0, 3).map((p) => ({
      title: `External: ${p.pattern}`,
      description: `${p.insight} (${p.confidence} confidence, n=${p.sampleSize})`,
      severity: (p.confidence === "high" ? "MEDIUM" : "LOW") as AnalyticsInsight["severity"],
      category: "GENERAL" as const,
    })),
  ].slice(0, 15);

  const payload: AnalyticsPayload = {
    generatedAt: now.toISOString(),
    periodDays: PERIOD_DAYS,
    executive: {
      yesterday: {
        sales: yesterdaySales,
        netSales: yesterdayNet,
        foodCostPct: yesterdayFoodPct,
        laborPct: yesterdayLaborPct,
        primeCostPct: yesterdayFoodPct + yesterdayLaborPct,
        profitEstimate: yesterdayNet * 0.12,
        guestCount: yesterdayGuests,
      },
      last7Days: { salesTrend, profitTrend, reviewTrend },
      alerts,
    },
    sales: {
      totalSales,
      netSales,
      byDaypart: byDaypartSorted,
      byHour: byHourSorted,
      byMenuItem: byMenuItemSorted.slice(0, 15),
      byCategory: Object.entries(categorySales).map(([category, v]) => ({
        category,
        ...v,
      })),
      averageCheck,
      averageSpendPerGuest,
      guestCount,
      revenuePerSeat,
      revenuePerLaborHour,
      revenuePerSqFt,
      byChannel: byChannelSorted,
      highlights: salesHighlights,
      questions: [
        "What sells?",
        "When are we busiest?",
        "Which channels are most profitable?",
      ],
    },
    foodCost: {
      inventoryValuation,
      theoreticalFoodCost,
      actualFoodCost,
      wasteCost,
      spoilageCost,
      foodCostPct,
      theoreticalFoodCostPct,
      variancePct,
      inventoryTurnover,
      daysOnHand,
      inventoryCounts,
      recipeCosts,
      wasteByReason,
      pricingChanges,
      vendorComparison,
      lowStockItems: lowStock.map((i) => ({
        name: i.name,
        quantity: i.quantity,
        minQuantity: i.minQuantity,
      })),
      topCostDrivers,
      highlights: foodCostHighlights,
      questions: [
        "Where is product disappearing?",
        "Which items are driving food cost increases?",
        "Are recipes being followed?",
      ],
    },
    labor: {
      scheduledHours,
      actualHours,
      overtimeHours,
      laborCost,
      laborPct,
      salesPerLaborHour: revenuePerLaborHour,
      guestsPerLaborHour: actualHours > 0 ? guestCount / actualHours : 0,
      overtimePct: actualHours > 0 ? (overtimeHours / actualHours) * 100 : 0,
      laborVarianceHours,
      laborVariancePct,
      byPosition: staff.reduce(
        (acc, s) => {
          const existing = acc.find((a) => a.role === s.role);
          const hrs = shifts
            .filter((sh) => sh.staffMemberId === s.id)
            .reduce((sum, sh) => sum + shiftHours(sh.startTime, sh.endTime), 0);
          const cost = hrs * s.hourlyRate;
          if (existing) {
            existing.hours += hrs;
            existing.cost += cost;
          } else acc.push({ role: s.role, hours: hrs, cost });
          return acc;
        },
        [] as Array<{ role: string; hours: number; cost: number }>
      ),
      byShift,
      bySalesHour,
      byEmployee,
      highlights: laborHighlights,
      questions: [
        "Are we overstaffed or understaffed?",
        "Which shifts are inefficient?",
        "Which employees produce the best results?",
      ],
    },
    menuEngineering: {
      items: menuEngineeringItems.sort((a, b) => b.contribution - a.contribution),
      stars: menuEngineeringItems.filter((m) => m.quadrant === "star").length,
      plowhorses: menuEngineeringItems.filter((m) => m.quadrant === "plowhorse").length,
      puzzles: menuEngineeringItems.filter((m) => m.quadrant === "puzzle").length,
      dogs: dogs.length,
      totalItemsSold,
      totalContribution,
      avgPopularityPct,
      avgMarginPct,
      menuMix,
      byQuadrant: {
        star: menuEngineeringItems.filter((m) => m.quadrant === "star"),
        plowhorse: menuEngineeringItems.filter((m) => m.quadrant === "plowhorse"),
        puzzle: menuEngineeringItems.filter((m) => m.quadrant === "puzzle"),
        dog: dogs,
      },
      highlights: menuHighlights,
      questions: [
        "What should we promote?",
        "What should we reprice?",
        "What should we remove?",
      ],
    },
    marketing: {
      totalSpend: marketingSpend,
      campaigns: campaigns.map((c) => ({
        name: c.name,
        channel: c.channel,
        spend: c.spend,
        impressions: c.impressions,
        clicks: c.clicks,
        conversions: c.conversions,
        revenue: c.revenueAttributed,
        roas: c.spend > 0 ? c.revenueAttributed / c.spend : 0,
      })),
      couponUsage,
      emailPerformance,
      socialMedia,
      websiteTraffic,
      googleBusiness,
      socialEngagement,
      newGuests,
      returningGuests,
      repeatVisitRate:
        newGuests + returningGuests > 0
          ? (returningGuests / (newGuests + returningGuests)) * 100
          : 0,
      customerAcquisitionCost: conversions > 0 ? marketingSpend / conversions : 0,
      returnOnAdSpend,
      lifetimeValueEstimate: averageCheck * 4.2,
      highlights: marketingHighlights,
      questions: [
        "Is marketing actually generating sales?",
        "Which channels bring profitable customers?",
      ],
    },
    customerExperience: {
      avgRating,
      reviewCount: reviews.length,
      starDistribution: starBuckets,
      bySource,
      googleReviews: mapSourceMonitor(googleReviewList),
      openTableReviews: mapSourceMonitor(openTableReviewList),
      surveyResults,
      complaintCategories,
      resolutionTimes,
      sentiment,
      complaintsByDaypart,
      unresolvedCount: unresolvedNegative.length,
      recentReviews: reviews.slice(0, 10).map((r) => ({
        source: r.source,
        rating: r.rating,
        comment: r.comment,
        date: r.createdAt.toISOString(),
        category: r.category,
      })),
      highlights: customerHighlights,
      questions: [
        "What is hurting guest satisfaction?",
        "Which locations or shifts create complaints?",
      ],
    },
    operations: {
      avgTicketTimeMinutes: avgTicketTime,
      avgKitchenProductionMinutes,
      orderAccuracyPct: 100 - (totalVoids / (totalSales || 1)) * 100 - (totalCompAmount / (totalSales || 1)) * 50,
      voidRatePct: totalSales > 0 ? (totalVoids / totalSales) * 100 : 0,
      voidTotal: totalVoids,
      discountRatePct: totalSales > 0 ? (totalDiscountAmount / totalSales) * 100 : 0,
      discountTotal: totalDiscountAmount,
      compRatePct: totalSales > 0 ? (totalCompAmount / totalSales) * 100 : 0,
      compTotal: totalCompAmount,
      refundTotal: totalVoids,
      refundRatePct: totalSales > 0 ? (totalVoids / totalSales) * 100 : 0,
      bottleneckDaypart,
      ticketTimesByDaypart,
      ticketTimesByHour,
      highlights: operationsHighlights,
      questions: [
        "Where are bottlenecks?",
        "Are long ticket times hurting sales?",
      ],
    },
    purchasing: {
      totalPurchases: purchasingTotal,
      vendorCount: new Set(vendorInvoices.map((v) => v.vendor)).size,
      invoices: vendorInvoices.slice(0, 10).map((v) => ({
        vendor: v.vendor,
        amount: v.amount,
        priceChangePct: v.priceChangePct,
      })),
      costInflationPct: purchasingInflation,
      topVendors: Object.entries(
        vendorInvoices.reduce(
          (acc, v) => {
            if (!acc[v.vendor]) acc[v.vendor] = { spend: 0, orders: 0 };
            acc[v.vendor].spend += v.amount;
            acc[v.vendor].orders += 1;
            return acc;
          },
          {} as Record<string, { spend: number; orders: number }>
        )
      )
        .map(([vendor, v]) => ({ vendor, ...v }))
        .sort((a, b) => b.spend - a.spend)
        .slice(0, 6),
      highlights: purchasingHighlights,
      questions: [
        "Which suppliers are increasing costs?",
        "Are we paying market rates?",
        "What draft purchase orders are ready to approve?",
        "Which vendor wins the bid on each item this week?",
        "Do any invoices fail three-way match?",
        "What is at risk if we pay open vendor invoices?",
        "Did any vendor quietly raise prices on recent invoices?",
        "Are catch-weight items billed for more weight than we received?",
        "What vendor credits are open and locking AP sync?",
        "Which vendor has the best fill rate?",
        "Who delivers late during lunch rush?",
        "How often do vendors substitute cheaper brands?",
      ],
      draftPurchaseOrders: draftPurchaseOrders.slice(0, 8).map((d) => ({
        vendor: d.vendor ?? "Vendor",
        lineCount: d.lineCount,
        totalAmount: d.totalAmount,
        status: d.status,
      })),
      vendorBids: multiVendorBids.slice(0, 10).map((b) => ({
        itemName: b.itemName,
        recommendedVendor: b.recommendedVendor,
        savingsPct: b.savingsPct,
        vendors: b.vendors,
      })),
    },
    forecasting: {
      salesForecast7d,
      laborHoursForecast7d,
      inventoryRecommendations,
      cateringDemandForecast7d,
      seasonalTrends,
      seasonalNote,
      highlights: forecastingHighlights,
      questions: [
        "How much staff do I need next Friday?",
        "How much of every item should I order tomorrow?",
      ],
    },
    profitability: {
      grossProfit,
      netProfitEstimate: profitEstimate,
      profitMarginPct: netSales > 0 ? (profitEstimate / netSales) * 100 : 0,
      byMenuItem: byMenuItemProfit.slice(0, 15),
      byCategory: byCategoryProfit,
      byEmployee: byEmployeeProfit,
      byShift: byShiftProfit,
      byDaypart: byDaypartProfit,
      byHour: byHourProfit,
      byDay: byDayProfit,
      byLocation: byLocationProfit,
      byChannel: byChannelProfit,
      byDeliveryProvider: byDeliveryProviderProfit,
      byCampaign: byCampaignProfit,
      highlights: profitabilityHighlights,
      questions: [
        "Where is profit leaking?",
        "Which menu items, hours, days, and channels drive profit?",
        "Which employees, shifts, and campaigns are most profitable?",
      ],
    },
    externalFactors: {
      factors: externalFactors.map((f) => ({
        date: f.date.toISOString(),
        factorType: f.factorType,
        category: normalizeFactorCategory(f.factorType, f.description),
        description: f.description,
        impactPct: f.impactPct,
      })),
      patterns: patternSummaries,
      learnedPatterns,
      byCategory: externalByCategory,
      weatherForecast,
      weatherSource,
      weatherGeo,
      highlights: externalHighlights,
      questions: [
        "How does weather affect sales and delivery?",
        "Which local events, holidays, and sports games boost traffic?",
        "What patterns has the system learned automatically?",
      ],
    },
    aiInsights: mergedAiInsights,
    coverage: {
      sections: [
        { id: "sales", label: "Sales", covered: paidOrders.length > 0 },
        { id: "food", label: "Food Cost & Inventory", covered: inventory.length > 0 },
        { id: "labor", label: "Labor", covered: shifts.length > 0 },
        { id: "menu", label: "Menu Engineering", covered: menuItems.length > 0 },
        { id: "marketing", label: "Marketing", covered: campaigns.length > 0 || socialAccounts.length > 0 },
        { id: "customer", label: "Customer Experience", covered: reviews.length > 0 },
        { id: "operations", label: "Operations", covered: paidOrders.length > 0 },
        { id: "purchasing", label: "Purchasing", covered: vendorInvoices.length > 0 },
        { id: "forecasting", label: "Forecasting", covered: paidOrders.length >= 7 },
        { id: "profitability", label: "Profitability", covered: netSales > 0 },
        { id: "external", label: "External Factors", covered: externalFactors.length > 0 || weatherForecast.length > 0 || learnedPatterns.length > 0 },
        { id: "executive", label: "Executive Dashboard", covered: true },
      ],
    },
  };

  return payload;
}

function generateAnalyticsInsights(ctx: {
  netSales: number;
  foodCostPct: number;
  laborPct: number;
  menuEngineeringItems: MenuEngineeringItem[];
  lowStock: Array<{ name: string; quantity: number; minQuantity: number; unit: string }>;
  variancePct: number;
  daysOnHand: number;
  daypartMap: Record<Daypart, { sales: number; orders: number }>;
  hourMap: Record<number, { sales: number; orders: number }>;
  channelMap: Record<string, { sales: number; profit: number; orders: number }>;
  itemSales: Record<string, { name: string; sales: number; quantity: number }>;
  categorySales: Record<string, { sales: number; quantity: number }>;
  campaigns: Array<{ name: string; spend: number; revenueAttributed: number }>;
  reviews: Array<{ rating: number; resolved: boolean }>;
  vendorInvoices: Array<{ vendor: string; priceChangePct: number }>;
  externalFactors: Array<{ description: string; impactPct: number }>;
  averageCheck: number;
  averageSpendPerGuest: number;
  guestCount: number;
  revenuePerSeat: number;
  revenuePerLaborHour: number;
  revenuePerSqFt: number;
}): AnalyticsInsight[] {
  const insights: AnalyticsInsight[] = [];

  const topItem = Object.values(ctx.itemSales).sort((a, b) => b.sales - a.sales)[0];
  if (topItem) {
    insights.push({
      title: `What sells: ${topItem.name}`,
      description: `${topItem.name} is the top seller with $${topItem.sales.toFixed(0)} in sales (${topItem.quantity} units). Promote it on high-traffic channels and ensure prep par levels match demand.`,
      severity: "LOW",
      category: "SALES",
    });
  }

  const topCategory = Object.entries(ctx.categorySales).sort((a, b) => b[1].sales - a[1].sales)[0];
  if (topCategory) {
    insights.push({
      title: `Category leader: ${topCategory[0]}`,
      description: `${topCategory[0]} drives $${topCategory[1].sales.toFixed(0)} in category sales. Feature this category in lunch and dinner dayparts.`,
      severity: "LOW",
      category: "SALES",
    });
  }

  const busiestDaypart = (Object.entries(ctx.daypartMap) as Array<[Daypart, { sales: number; orders: number }]>)
    .sort((a, b) => b[1].orders - a[1].orders)[0];
  if (busiestDaypart && busiestDaypart[1].orders > 0) {
    insights.push({
      title: `Busiest daypart: ${busiestDaypart[0]}`,
      description: `${busiestDaypart[0]} has ${busiestDaypart[1].orders} orders and $${busiestDaypart[1].sales.toFixed(0)} net sales. Staff and prep should peak before this window.`,
      severity: "MEDIUM",
      category: "SALES",
    });
  }

  const busiestHour = Object.entries(ctx.hourMap)
    .map(([hour, v]) => ({ hour: Number(hour), ...v }))
    .sort((a, b) => b.orders - a.orders)[0];
  if (busiestHour && busiestHour.orders > 0) {
    insights.push({
      title: `Peak hour: ${formatHourLabel(busiestHour.hour)}`,
      description: `${formatHourLabel(busiestHour.hour)} is the busiest hour with ${busiestHour.orders} orders ($${busiestHour.sales.toFixed(0)} net sales). Align labor and kitchen capacity to this peak.`,
      severity: "MEDIUM",
      category: "SALES",
    });
  }

  const channels = Object.entries(ctx.channelMap)
    .map(([channel, v]) => ({
      channel,
      ...v,
      marginPct: v.sales > 0 ? (v.profit / v.sales) * 100 : 0,
    }))
    .sort((a, b) => b.profit - a.profit);
  const topChannel = channels[0];
  const volumeChannel = [...channels].sort((a, b) => b.sales - a.sales)[0];
  if (topChannel && topChannel.sales > 0) {
    insights.push({
      title: `Most profitable channel: ${topChannel.channel}`,
      description: `${topChannel.channel} delivers $${topChannel.profit.toFixed(0)} gross profit at ${topChannel.marginPct.toFixed(1)}% margin across ${topChannel.orders} orders. ${volumeChannel && volumeChannel.channel !== topChannel.channel ? `Volume leader is ${volumeChannel.channel} — compare margin vs volume when allocating marketing spend.` : ""}`.trim(),
      severity: "MEDIUM",
      category: "SALES",
    });
  }

  if (ctx.guestCount > 0) {
    insights.push({
      title: "Guest spend profile",
      description: `${ctx.guestCount} guests averaged $${ctx.averageSpendPerGuest.toFixed(2)} per guest and $${ctx.averageCheck.toFixed(2)} per check. Revenue per seat: $${ctx.revenuePerSeat.toFixed(0)}; per labor hour: $${ctx.revenuePerLaborHour.toFixed(0)}.`,
      severity: "LOW",
      category: "SALES",
    });
  }

  const topContribution = ctx.menuEngineeringItems.sort((a, b) => b.contribution - a.contribution)[0];
  if (topContribution && topContribution.contribution > 0) {
    insights.push({
      title: `${topContribution.name} leads contribution margin`,
      description: `${topContribution.name} generated $${topContribution.contribution.toFixed(0)} contribution (${topContribution.quadrant}).`,
      severity: "LOW",
      category: "MENU",
    });
  }

  const plowhorse = ctx.menuEngineeringItems.find((m) => m.quadrant === "plowhorse");
  if (plowhorse) {
    insights.push({
      title: `Reprice opportunity: ${plowhorse.name}`,
      description: `${plowhorse.name} is popular but margin is ${plowhorse.marginPct.toFixed(0)}%. A small price increase could improve profit.`,
      severity: "MEDIUM",
      category: "MENU",
    });
  }

  if (ctx.foodCostPct > 32) {
    insights.push({
      title: "Food cost above target",
      description: `Food cost is ${ctx.foodCostPct.toFixed(1)}%. Review vendor pricing and portion variance.`,
      severity: "HIGH",
      category: "FINANCE",
    });
  }

  if (ctx.variancePct < -2) {
    insights.push({
      title: "Actual food cost exceeds theoretical",
      description: `Variance of ${ctx.variancePct.toFixed(1)}% suggests waste, theft, or recipe drift.`,
      severity: "HIGH",
      category: "INVENTORY",
    });
  }

  const lettuce = ctx.lowStock.find((i) => /lettuce|romaine/i.test(i.name));
  if (lettuce && ctx.daysOnHand > 7) {
    insights.push({
      title: "Inventory days on hand elevated",
      description: `Carrying ~${ctx.daysOnHand.toFixed(0)} days of inventory; ${lettuce.name} may need tighter ordering.`,
      severity: "MEDIUM",
      category: "INVENTORY",
    });
  }

  if (ctx.daypartMap.lunch.orders > ctx.daypartMap.dinner.orders * 0.8) {
    insights.push({
      title: "Friday lunch may be understaffed",
      description: "Lunch volume is high relative to dinner — verify shift coverage for peak lunch periods.",
      severity: "MEDIUM",
      category: "STAFFING",
    });
  }

  const vendorSpike = ctx.vendorInvoices.find((v) => v.priceChangePct > 5);
  if (vendorSpike) {
    insights.push({
      title: `Vendor pricing increase: ${vendorSpike.vendor}`,
      description: `${vendorSpike.vendor} invoices show ${vendorSpike.priceChangePct.toFixed(1)}% price change — review menu pricing.`,
      severity: "MEDIUM",
      category: "FINANCE",
    });
  }

  const badReview = ctx.reviews.find((r) => r.rating < 3 && !r.resolved);
  if (badReview) {
    insights.push({
      title: "Unresolved negative review",
      description: "A guest left a low rating recently. Resolve and track complaint category trends.",
      severity: "HIGH",
      category: "CUSTOMER",
    });
  }

  const topCampaign = ctx.campaigns.sort((a, b) => b.revenueAttributed - a.revenueAttributed)[0];
  if (topCampaign && topCampaign.spend > 0) {
    insights.push({
      title: `${topCampaign.name} campaign performance`,
      description: `ROAS ${(topCampaign.revenueAttributed / topCampaign.spend).toFixed(1)}x on $${topCampaign.spend.toFixed(0)} spend.`,
      severity: "LOW",
      category: "GENERAL",
    });
  }

  return insights.slice(0, 12);
}

/** Trimmed analytics payload for AI insight generation (keeps token size reasonable). */
export function buildAnalyticsSnapshotForAI(payload: AnalyticsPayload) {
  return {
    periodDays: payload.periodDays,
    sales: {
      totalSales: payload.sales.totalSales,
      netSales: payload.sales.netSales,
      averageCheck: payload.sales.averageCheck,
      averageSpendPerGuest: payload.sales.averageSpendPerGuest,
      guestCount: payload.sales.guestCount,
      revenuePerSeat: payload.sales.revenuePerSeat,
      revenuePerLaborHour: payload.sales.revenuePerLaborHour,
      revenuePerSqFt: payload.sales.revenuePerSqFt,
      byDaypart: payload.sales.byDaypart,
      byHour: payload.sales.byHour,
      topMenuItems: payload.sales.byMenuItem.slice(0, 10),
      byCategory: payload.sales.byCategory,
      byChannel: payload.sales.byChannel,
      highlights: payload.sales.highlights,
      keyQuestions: payload.sales.questions,
    },
    foodCost: {
      foodCostPct: payload.foodCost.foodCostPct,
      theoreticalFoodCostPct: payload.foodCost.theoreticalFoodCostPct,
      variancePct: payload.foodCost.variancePct,
      inventoryTurnover: payload.foodCost.inventoryTurnover,
      daysOnHand: payload.foodCost.daysOnHand,
      wasteCost: payload.foodCost.wasteCost,
      spoilageCost: payload.foodCost.spoilageCost,
      highlights: payload.foodCost.highlights,
      keyQuestions: payload.foodCost.questions,
      topCostDrivers: payload.foodCost.topCostDrivers.slice(0, 8),
      inventoryCounts: payload.foodCost.inventoryCounts.slice(0, 10),
      recipeCosts: payload.foodCost.recipeCosts.slice(0, 8),
      wasteByReason: payload.foodCost.wasteByReason,
      pricingChanges: payload.foodCost.pricingChanges.slice(0, 6),
      vendorComparison: payload.foodCost.vendorComparison.slice(0, 5),
      lowStockItems: payload.foodCost.lowStockItems.slice(0, 5),
    },
    labor: {
      laborPct: payload.labor.laborPct,
      salesPerLaborHour: payload.labor.salesPerLaborHour,
      guestsPerLaborHour: payload.labor.guestsPerLaborHour,
      overtimeHours: payload.labor.overtimeHours,
      overtimePct: payload.labor.overtimePct,
      laborVarianceHours: payload.labor.laborVarianceHours,
      laborVariancePct: payload.labor.laborVariancePct,
      scheduledHours: payload.labor.scheduledHours,
      actualHours: payload.labor.actualHours,
      highlights: payload.labor.highlights,
      keyQuestions: payload.labor.questions,
      byShift: payload.labor.byShift,
      bySalesHour: payload.labor.bySalesHour.slice(0, 12),
      byEmployee: payload.labor.byEmployee.slice(0, 8),
      byPosition: payload.labor.byPosition,
    },
    menuEngineering: {
      stars: payload.menuEngineering.stars,
      plowhorses: payload.menuEngineering.plowhorses,
      puzzles: payload.menuEngineering.puzzles,
      dogs: payload.menuEngineering.dogs,
      totalItemsSold: payload.menuEngineering.totalItemsSold,
      totalContribution: payload.menuEngineering.totalContribution,
      avgPopularityPct: payload.menuEngineering.avgPopularityPct,
      avgMarginPct: payload.menuEngineering.avgMarginPct,
      highlights: payload.menuEngineering.highlights,
      keyQuestions: payload.menuEngineering.questions,
      menuMix: payload.menuEngineering.menuMix.slice(0, 8),
      topItems: payload.menuEngineering.items.slice(0, 10).map((i) => ({
        name: i.name,
        quadrant: i.quadrant,
        contribution: i.contribution,
        marginPct: i.marginPct,
        popularityPct: i.popularityPct,
        quantitySold: i.quantitySold,
        recipeCost: i.recipeCost,
        price: i.price,
      })),
      byQuadrant: {
        star: payload.menuEngineering.byQuadrant.star.slice(0, 5).map((i) => i.name),
        plowhorse: payload.menuEngineering.byQuadrant.plowhorse.slice(0, 5).map((i) => i.name),
        puzzle: payload.menuEngineering.byQuadrant.puzzle.slice(0, 5).map((i) => i.name),
        dog: payload.menuEngineering.byQuadrant.dog.slice(0, 5).map((i) => i.name),
      },
    },
    profitability: {
      grossProfit: payload.profitability.grossProfit,
      netProfitEstimate: payload.profitability.netProfitEstimate,
      profitMarginPct: payload.profitability.profitMarginPct,
      highlights: payload.profitability.highlights,
      keyQuestions: payload.profitability.questions,
      byMenuItem: payload.profitability.byMenuItem.slice(0, 10),
      byCategory: payload.profitability.byCategory.slice(0, 8),
      byEmployee: payload.profitability.byEmployee.slice(0, 8),
      byShift: payload.profitability.byShift,
      byDaypart: payload.profitability.byDaypart,
      byHour: payload.profitability.byHour.slice(0, 12),
      byDay: payload.profitability.byDay.slice(-7),
      byLocation: payload.profitability.byLocation,
      byChannel: payload.profitability.byChannel,
      byDeliveryProvider: payload.profitability.byDeliveryProvider,
      byCampaign: payload.profitability.byCampaign.slice(0, 8),
    },
    purchasing: {
      totalPurchases: payload.purchasing.totalPurchases,
      costInflationPct: payload.purchasing.costInflationPct,
      highlights: payload.purchasing.highlights,
      keyQuestions: payload.purchasing.questions,
      topVendors: payload.purchasing.topVendors.slice(0, 6),
      draftPurchaseOrders: payload.purchasing.draftPurchaseOrders ?? [],
      vendorBids: payload.purchasing.vendorBids ?? [],
      vendorComparison: payload.foodCost.vendorComparison.slice(0, 6),
      threeWayMatch: payload.purchasing.highlights.threeWayMatch,
      invoiceDigitization: payload.purchasing.highlights.invoiceDigitization,
      creditMemoTracking: payload.purchasing.highlights.creditMemoTracking,
      vendorScorecards: payload.purchasing.highlights.vendorScorecards,
    },
    forecasting: {
      salesForecast7d: payload.forecasting.salesForecast7d,
      laborHoursForecast7d: payload.forecasting.laborHoursForecast7d,
      cateringDemandForecast7d: payload.forecasting.cateringDemandForecast7d,
      seasonalTrends: payload.forecasting.seasonalTrends,
      highlights: payload.forecasting.highlights,
      keyQuestions: payload.forecasting.questions,
      seasonalNote: payload.forecasting.seasonalNote,
      inventoryRecommendations: payload.forecasting.inventoryRecommendations.slice(0, 8),
    },
    externalFactors: {
      highlights: payload.externalFactors.highlights,
      keyQuestions: payload.externalFactors.questions,
      factors: payload.externalFactors.factors.slice(0, 12),
      patterns: payload.externalFactors.patterns,
      learnedPatterns: payload.externalFactors.learnedPatterns,
      byCategory: payload.externalFactors.byCategory,
      categoryCoverage: payload.externalFactors.highlights.categoryCoverage,
      weatherForecast: payload.externalFactors.weatherForecast,
      weatherSource: payload.externalFactors.weatherSource,
      weatherGeo: payload.externalFactors.weatherGeo,
    },
    executive: {
      yesterday: payload.executive.yesterday,
      alerts: payload.executive.alerts,
    },
    marketing: {
      totalSpend: payload.marketing.totalSpend,
      returnOnAdSpend: payload.marketing.returnOnAdSpend,
      customerAcquisitionCost: payload.marketing.customerAcquisitionCost,
      lifetimeValueEstimate: payload.marketing.lifetimeValueEstimate,
      repeatVisitRate: payload.marketing.repeatVisitRate,
      newGuests: payload.marketing.newGuests,
      returningGuests: payload.marketing.returningGuests,
      highlights: payload.marketing.highlights,
      keyQuestions: payload.marketing.questions,
      campaigns: payload.marketing.campaigns.slice(0, 6),
      couponUsage: payload.marketing.couponUsage,
      emailPerformance: payload.marketing.emailPerformance,
      socialMedia: payload.marketing.socialMedia,
      websiteTraffic: payload.marketing.websiteTraffic,
      googleBusiness: payload.marketing.googleBusiness,
    },
    customerExperience: {
      avgRating: payload.customerExperience.avgRating,
      reviewCount: payload.customerExperience.reviewCount,
      unresolvedCount: payload.customerExperience.unresolvedCount,
      highlights: payload.customerExperience.highlights,
      keyQuestions: payload.customerExperience.questions,
      googleReviews: payload.customerExperience.googleReviews,
      openTableReviews: payload.customerExperience.openTableReviews,
      complaintCategories: payload.customerExperience.complaintCategories.slice(0, 6),
      surveyResults: payload.customerExperience.surveyResults.slice(0, 6),
      complaintsByDaypart: payload.customerExperience.complaintsByDaypart,
      resolutionTimes: payload.customerExperience.resolutionTimes,
      sentiment: payload.customerExperience.sentiment,
      starDistribution: payload.customerExperience.starDistribution,
    },
    operations: {
      avgTicketTimeMinutes: payload.operations.avgTicketTimeMinutes,
      avgKitchenProductionMinutes: payload.operations.avgKitchenProductionMinutes,
      orderAccuracyPct: payload.operations.orderAccuracyPct,
      voidRatePct: payload.operations.voidRatePct,
      discountRatePct: payload.operations.discountRatePct,
      compRatePct: payload.operations.compRatePct,
      refundTotal: payload.operations.refundTotal,
      highlights: payload.operations.highlights,
      keyQuestions: payload.operations.questions,
      ticketTimesByDaypart: payload.operations.ticketTimesByDaypart,
      ticketTimesByHour: payload.operations.ticketTimesByHour.slice(0, 12),
      voidTotal: payload.operations.voidTotal,
      discountTotal: payload.operations.discountTotal,
      compTotal: payload.operations.compTotal,
    },
    executiveAlerts: payload.executive.alerts,
  };
}
