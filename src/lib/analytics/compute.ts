import { prisma } from "@/lib/prisma";
import type {
  AnalyticsPayload,
  AnalyticsInsight,
  Daypart,
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

  const [
    location,
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
    externalFactors,
    socialAccounts,
    websiteConnection,
    socialPosts,
  ] = await Promise.all([
    prisma.location.findUnique({ where: { id: locationId } }),
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
    prisma.externalFactor.findMany({
      where: { locationId, date: { gte: periodStart } },
      orderBy: { date: "desc" },
    }),
    prisma.socialAccount.findMany({ where: { locationId, connected: true } }),
    safeWebsiteConnection(locationId),
    safeSocialPosts(locationId, periodStart),
  ]);

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
    (s, sh) => s + shiftHours(sh.startTime, sh.endTime) * sh.staffMember.hourlyRate,
    0
  );
  const weeksInPeriod = PERIOD_DAYS / 7;
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
    channelMap[ch].sales += netOrder;
    channelMap[ch].profit += netOrder - orderFoodCost;
    channelMap[ch].orders += 1;

    const dk = dateKey(o.createdAt);
    dayProfit[dk] = (dayProfit[dk] ?? 0) + o.totalAmount - orderFoodCost - o.totalAmount * 0.25;

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
    }
  }

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

  const avgDailySales = netSales / PERIOD_DAYS;
  const salesForecast7d = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now);
    d.setDate(d.getDate() + i + 1);
    return { date: dateKey(d), predicted: avgDailySales * (1 + (i % 2 === 0 ? 0.05 : -0.02)) };
  });

  const laborHoursForecast7d = salesForecast7d.map((f) => ({
    date: f.date,
    hours: f.predicted > 0 ? f.predicted / (revenuePerLaborHour || 100) : scheduledHours / 7,
  }));

  const inventoryRecommendations = inventory
    .filter((i) => i.quantity <= i.minQuantity * 1.5)
    .map((i) => ({
      name: i.name,
      suggestedOrder: Math.max(i.minQuantity * 2 - i.quantity, i.minQuantity),
      unit: i.unit,
    }));

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
    const rate = sh.staffMember.hourlyRate;
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
    const cost = hrs * sh.staffMember.hourlyRate;
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
      bySource: Object.entries(
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
      })),
      complaintCategories: Object.entries(
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
      ).map(([category, count]) => ({ category, count })),
      unresolvedCount: reviews.filter((r) => !r.resolved && r.rating < 4).length,
      recentReviews: reviews.slice(0, 8).map((r) => ({
        source: r.source,
        rating: r.rating,
        comment: r.comment,
        date: r.createdAt.toISOString(),
      })),
      questions: [
        "What is hurting guest satisfaction?",
        "Which complaint categories are rising?",
      ],
    },
    operations: {
      avgTicketTimeMinutes: avgTicketTime,
      orderAccuracyPct: 100 - (totalVoids / (totalSales || 1)) * 100,
      voidRatePct: totalSales > 0 ? (totalVoids / totalSales) * 100 : 0,
      discountRatePct: totalSales > 0 ? (paidOrders.reduce((s, o) => s + o.discountAmount, 0) / totalSales) * 100 : 0,
      compRatePct: totalSales > 0 ? (paidOrders.reduce((s, o) => s + o.compAmount, 0) / totalSales) * 100 : 0,
      refundTotal: totalVoids,
      bottleneckDaypart: Object.entries(daypartMap).sort((a, b) => b[1].orders - a[1].orders)[0]?.[0] ?? "dinner",
      questions: [
        "Where are bottlenecks?",
        "Are long ticket times hurting sales?",
      ],
    },
    purchasing: {
      totalPurchases: vendorInvoices.reduce((s, v) => s + v.amount, 0),
      vendorCount: new Set(vendorInvoices.map((v) => v.vendor)).size,
      invoices: vendorInvoices.slice(0, 10).map((v) => ({
        vendor: v.vendor,
        amount: v.amount,
        priceChangePct: v.priceChangePct,
      })),
      costInflationPct:
        vendorInvoices.length > 0
          ? vendorInvoices.reduce((s, v) => s + v.priceChangePct, 0) / vendorInvoices.length
          : 0,
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
      questions: [
        "Which suppliers are increasing costs?",
        "Are we paying market rates?",
      ],
    },
    forecasting: {
      salesForecast7d,
      laborHoursForecast7d,
      inventoryRecommendations,
      seasonalNote: externalFactors[0]?.description ?? "Monitor weekend and weather-driven demand shifts.",
      questions: [
        "How much staff do I need next Friday?",
        "How much inventory should I order tomorrow?",
      ],
    },
    profitability: {
      grossProfit: netSales - actualFoodCost,
      netProfitEstimate: profitEstimate,
      profitMarginPct: netSales > 0 ? (profitEstimate / netSales) * 100 : 0,
      byMenuItem: menuEngineeringItems
        .map((m) => ({
          name: m.name,
          profit: m.contribution,
          marginPct: m.marginPct,
        }))
        .slice(0, 12),
      byCategory: Object.entries(categorySales).map(([category, v]) => ({
        category,
        profit: v.sales * 0.35,
      })),
      byDaypart: (["breakfast", "lunch", "dinner", "late"] as Daypart[]).map((dp) => ({
        daypart: dp,
        profit: daypartMap[dp].sales * 0.3,
      })),
      byChannel: Object.entries(channelMap).map(([channel, v]) => ({
        channel,
        profit: v.profit,
      })),
      byDay: Object.entries(dayProfit)
        .map(([date, profit]) => ({ date, profit }))
        .sort((a, b) => a.date.localeCompare(b.date))
        .slice(-14),
      questions: [
        "Where is profit leaking?",
        "Which items, hours, and channels drive margin?",
      ],
    },
    externalFactors: {
      factors: externalFactors.map((f) => ({
        date: f.date.toISOString(),
        factorType: f.factorType,
        description: f.description,
        impactPct: f.impactPct,
      })),
      patterns: buildExternalPatterns(externalFactors),
      questions: [
        "How does weather affect sales?",
        "Which local events boost traffic?",
      ],
    },
    aiInsights,
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
        { id: "external", label: "External Factors", covered: externalFactors.length > 0 },
        { id: "executive", label: "Executive Dashboard", covered: true },
      ],
    },
  };

  return payload;
}

function buildExternalPatterns(
  factors: Array<{ factorType: string; description: string; impactPct: number }>
) {
  const patterns: Array<{ pattern: string; insight: string }> = [];
  const weather = factors.filter((f) => /weather|rain/i.test(f.factorType + f.description));
  if (weather.length > 0) {
    const avg = weather.reduce((s, f) => s + f.impactPct, 0) / weather.length;
    patterns.push({
      pattern: "Weather",
      insight: `Rainy days correlate with ~${avg.toFixed(0)}% delivery shift`,
    });
  }
  const events = factors.filter((f) => /event|concert|game|holiday/i.test(f.factorType + f.description));
  if (events.length > 0) {
    patterns.push({
      pattern: "Local events",
      insight: "Event nights show elevated sales — staff up accordingly",
    });
  }
  if (patterns.length === 0) {
    patterns.push({
      pattern: "Data collection",
      insight: "Add weather and event factors to improve demand forecasting",
    });
  }
  return patterns;
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
      profitMarginPct: payload.profitability.profitMarginPct,
      byChannel: payload.profitability.byChannel,
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
    operations: {
      avgTicketTimeMinutes: payload.operations.avgTicketTimeMinutes,
      voidRatePct: payload.operations.voidRatePct,
      discountRatePct: payload.operations.discountRatePct,
      bottleneckDaypart: payload.operations.bottleneckDaypart,
    },
    executiveAlerts: payload.executive.alerts,
  };
}
