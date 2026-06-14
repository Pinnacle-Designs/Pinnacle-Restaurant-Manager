import OpenAI from "openai";
import { prisma } from "./prisma";
import { getLocationId } from "./location";
import { computeAnalytics, buildAnalyticsSnapshotForAI } from "./analytics/compute";
import type { InsightCategory, InsightSeverity } from "@prisma/client";

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

export async function analyzePhoto(
  imageBase64: string,
  category: string
): Promise<{ description: string; tags: string[]; suggestedTitle: string }> {
  if (!openai) {
    return {
      description: "AI analysis unavailable — set OPENAI_API_KEY in .env",
      tags: [category.toLowerCase()],
      suggestedTitle: `${category} photo`,
    };
  }

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Analyze this restaurant photo (category: ${category}). Return JSON with: description (brief), tags (array of strings), suggestedTitle (short title). Focus on restaurant operations relevance.`,
            },
            {
              type: "image_url",
              image_url: { url: `data:image/jpeg;base64,${imageBase64}` },
            },
          ],
        },
      ],
      max_tokens: 300,
      response_format: { type: "json_object" },
    });

    const content = response.choices[0]?.message?.content;
    if (content) {
      const parsed = JSON.parse(content);
      return {
        description: parsed.description || "No description",
        tags: parsed.tags || [],
        suggestedTitle: parsed.suggestedTitle || "Untitled",
      };
    }
  } catch (error) {
    console.error("Photo analysis error:", error);
  }

  return {
    description: "Analysis failed",
    tags: [category.toLowerCase()],
    suggestedTitle: `${category} photo`,
  };
}

export interface ReceiptData {
  description: string;
  amount: number;
  category: string;
  date: string;
  vendor: string;
  items: string[];
}

export async function analyzeReceipt(imageBase64: string): Promise<ReceiptData> {
  const fallback: ReceiptData = {
    description: "Receipt expense",
    amount: 0,
    category: "Food & Supplies",
    date: new Date().toISOString().split("T")[0],
    vendor: "Unknown vendor",
    items: [],
  };

  if (!openai) {
    return {
      ...fallback,
      description: "Receipt (manual entry required — set OPENAI_API_KEY)",
    };
  }

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Extract data from this receipt image for a restaurant expense record. Return JSON with: description (vendor + brief summary), amount (total as number), category (one of: Food & Supplies, Utilities, Maintenance, Labor, Marketing, Equipment, Insurance, Other), date (YYYY-MM-DD), vendor (store name), items (array of line item strings). Use the total amount including tax.`,
            },
            {
              type: "image_url",
              image_url: { url: `data:image/jpeg;base64,${imageBase64}` },
            },
          ],
        },
      ],
      max_tokens: 500,
      response_format: { type: "json_object" },
    });

    const content = response.choices[0]?.message?.content;
    if (content) {
      const parsed = JSON.parse(content);
      return {
        description: parsed.description || parsed.vendor || "Receipt",
        amount: parseFloat(parsed.amount) || 0,
        category: parsed.category || "Food & Supplies",
        date: parsed.date || fallback.date,
        vendor: parsed.vendor || "Unknown",
        items: parsed.items || [],
      };
    }
  } catch (error) {
    console.error("Receipt OCR error:", error);
  }

  return fallback;
}

export async function generateBusinessInsights(locationId?: string): Promise<
  Array<{
    title: string;
    description: string;
    category: InsightCategory;
    severity: InsightSeverity;
    actionable: string;
  }>
> {
  const locId = locationId || (await getLocationId());

  const [inventory, menuItems, staff, recentOrders, expenses, recentPhotos, analyticsPayload] =
    await Promise.all([
      prisma.inventoryItem.findMany({ where: { locationId: locId } }),
      prisma.menuItem.findMany({ where: { locationId: locId } }),
      prisma.staffMember.findMany({ where: { locationId: locId, active: true } }),
      prisma.order.findMany({
        where: {
          locationId: locId,
          createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        },
        include: { items: true },
      }),
      prisma.expense.findMany({
        where: {
          locationId: locId,
          date: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
        },
      }),
      prisma.photo.findMany({
        where: { locationId: locId },
        take: 10,
        orderBy: { createdAt: "desc" },
      }),
      computeAnalytics(locId),
    ]);

  const lowStockItems = inventory.filter((item) => item.quantity <= item.minQuantity);
  const totalRevenue = recentOrders
    .filter((o) => o.status === "PAID")
    .reduce((sum, o) => sum + o.totalAmount, 0);
  const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
  const unavailableItems = menuItems.filter((m) => !m.available);

  const businessSnapshot = {
    inventoryCount: inventory.length,
    lowStockItems: lowStockItems.map((i) => ({
      name: i.name,
      quantity: i.quantity,
      min: i.minQuantity,
    })),
    menuItemCount: menuItems.length,
    unavailableMenuItems: unavailableItems.map((m) => m.name),
    activeStaff: staff.length,
    weeklyOrders: recentOrders.length,
    weeklyRevenue: totalRevenue,
    monthlyExpenses: totalExpenses,
    profitMargin: totalRevenue - totalExpenses,
    recentPhotoCount: recentPhotos.length,
    analytics: buildAnalyticsSnapshotForAI(analyticsPayload),
  };

  if (!openai) {
    return generateRuleBasedInsights(businessSnapshot);
  }

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are a restaurant business analyst with full sales, food cost, labor, menu engineering, and marketing analytics. Analyze the data and identify pain points, risks, and opportunities. You MUST answer sales questions using analytics.sales: (1) What sells? (2) When are we busiest? (3) Which channels are most profitable? You MUST answer food cost questions using analytics.foodCost: (1) Where is product disappearing? (2) Which items are driving food cost increases? (3) Are recipes being followed? You MUST answer labor questions using analytics.labor: (1) Are we overstaffed or understaffed? (2) Which shifts are inefficient? (3) Which employees produce the best results? You MUST answer menu questions using analytics.menuEngineering: (1) What should we promote? (2) What should we reprice? (3) What should we remove? You MUST answer marketing questions using analytics.marketing: (1) Is marketing actually generating sales? — use highlights.salesGenerating; (2) Which channels bring profitable customers? — use highlights.profitableChannels. Reference CAC, ROAS, LTV, repeat visit rate, coupon usage, email, social, website, and Google Business. Return JSON with an insights array. Each insight has: title, description, category (INVENTORY|STAFFING|FINANCE|OPERATIONS|MENU|CUSTOMER|FACILITY|GENERAL), severity (LOW|MEDIUM|HIGH|CRITICAL), actionable (specific action to take). Include insights for each area when data exists. Focus on actionable pain points.",
        },
        {
          role: "user",
          content: JSON.stringify(businessSnapshot),
        },
      ],
      max_tokens: 1500,
      response_format: { type: "json_object" },
    });

    const content = response.choices[0]?.message?.content;
    if (content) {
      const parsed = JSON.parse(content);
      return parsed.insights || [];
    }
  } catch (error) {
    console.error("Insight generation error:", error);
  }

  return generateRuleBasedInsights(businessSnapshot);
}

function generateRuleBasedInsights(snapshot: {
  lowStockItems: Array<{ name: string; quantity: number; min: number }>;
  unavailableMenuItems: string[];
  weeklyOrders: number;
  weeklyRevenue: number;
  monthlyExpenses: number;
  profitMargin: number;
  activeStaff: number;
  analytics?: ReturnType<typeof buildAnalyticsSnapshotForAI>;
}): Array<{
  title: string;
  description: string;
  category: InsightCategory;
  severity: InsightSeverity;
  actionable: string;
}> {
  const insights: Array<{
    title: string;
    description: string;
    category: InsightCategory;
    severity: InsightSeverity;
    actionable: string;
  }> = [];

  const sales = snapshot.analytics?.sales;
  if (sales?.highlights.topSellingItem) {
    const item = sales.highlights.topSellingItem;
    insights.push({
      title: `What sells: ${item.name}`,
      description: `${item.name} leads with $${item.sales.toFixed(0)} in sales (${item.quantity} units sold).`,
      category: "OPERATIONS",
      severity: "LOW",
      actionable: "Feature this item in promotions and verify inventory par levels.",
    });
  }

  if (sales?.highlights.busiestDaypart && sales.highlights.busiestHour) {
    const dp = sales.highlights.busiestDaypart;
    const hr = sales.highlights.busiestHour;
    const hourLabel = hr.hour % 12 === 0 ? 12 : hr.hour % 12;
    const suffix = hr.hour >= 12 ? "PM" : "AM";
    insights.push({
      title: `Peak traffic: ${dp.daypart} / ${hourLabel}:00 ${suffix}`,
      description: `${dp.daypart} is the busiest daypart (${dp.orders} orders). Peak hour is ${hourLabel}:00 ${suffix} with ${hr.orders} orders.`,
      category: "STAFFING",
      severity: "MEDIUM",
      actionable: "Align prep and staffing 30–60 minutes before peak daypart and hour.",
    });
  }

  if (sales?.highlights.mostProfitableChannel) {
    const ch = sales.highlights.mostProfitableChannel;
    insights.push({
      title: `Most profitable channel: ${ch.channel}`,
      description: `${ch.channel} earns $${ch.profit.toFixed(0)} gross profit at ${ch.marginPct.toFixed(1)}% margin (${ch.orders} orders).`,
      category: "FINANCE",
      severity: "MEDIUM",
      actionable: "Invest marketing in high-margin channels; review fees on low-margin delivery platforms.",
    });
  }

  if (sales && sales.netSales > 0) {
    insights.push({
      title: "Sales performance snapshot",
      description: `Net sales $${sales.netSales.toFixed(0)} over ${snapshot.analytics?.periodDays ?? 30} days. Avg check $${sales.averageCheck.toFixed(2)}, ${sales.guestCount} guests, rev/seat $${sales.revenuePerSeat.toFixed(0)}, rev/labor hr $${sales.revenuePerLaborHour.toFixed(0)}.`,
      category: "FINANCE",
      severity: "LOW",
      actionable: "Track these KPIs weekly and compare against labor and food cost targets.",
    });
  }

  const food = snapshot.analytics?.foodCost;
  if (food?.highlights) {
    const pd = food.highlights.productDisappearing;
    insights.push({
      title: "Where is product disappearing?",
      description: `Primary loss: ${pd.primaryCause}. Waste $${pd.wasteCost.toFixed(0)}, spoilage $${pd.spoilageCost.toFixed(0)}, variance gap ${pd.varianceGapPct.toFixed(1)}%.`,
      category: "INVENTORY",
      severity: pd.wasteCost + pd.spoilageCost > 100 ? "HIGH" : "MEDIUM",
      actionable: "Audit waste logs, tighten prep yields, and reconcile inventory counts weekly.",
    });

    const drivers = food.highlights.costIncreaseDrivers;
    if (drivers.length > 0) {
      insights.push({
        title: "Items driving food cost increases",
        description: drivers
          .slice(0, 3)
          .map((d) => `${d.name} (+${d.changePct.toFixed(1)}%)`)
          .join(", "),
        category: "FINANCE",
        severity: drivers.some((d) => d.changePct > 7) ? "HIGH" : "MEDIUM",
        actionable: "Renegotiate vendor contracts or adjust menu pricing on high-increase items.",
      });
    }

    const rc = food.highlights.recipeCompliance;
    if (rc.status === "drift") {
      insights.push({
        title: "Recipes may not be followed",
        description: `Actual food cost ${rc.actualPct.toFixed(1)}% exceeds theoretical ${rc.theoreticalPct.toFixed(1)}% by ${Math.abs(rc.variancePct).toFixed(1)}%.${rc.topDriftItem ? ` Focus on ${rc.topDriftItem}.` : ""}`,
        category: "MENU",
        severity: "HIGH",
        actionable: "Re-weigh portions, retrain kitchen staff, and spot-check plate builds during service.",
      });
    }
  }

  const labor = snapshot.analytics?.labor;
  if (labor?.highlights) {
    const lh = labor.highlights;
    insights.push({
      title: "Are we overstaffed or understaffed?",
      description: `${lh.staffingStatus === "overstaffed" ? "Overstaffed" : lh.staffingStatus === "understaffed" ? "Understaffed" : "Balanced"} — ${lh.staffingReason}`,
      category: "STAFFING",
      severity: lh.staffingStatus !== "balanced" ? "HIGH" : "MEDIUM",
      actionable:
        lh.staffingStatus === "overstaffed"
          ? "Cut hours on low-sales dayparts and rebalance shift start times."
          : lh.staffingStatus === "understaffed"
            ? "Add coverage during peak sales hours and cross-train staff for flexibility."
            : "Maintain current staffing mix and monitor weekly labor %.",
    });

    if (lh.inefficientShifts.length > 0) {
      const worst = lh.inefficientShifts[0]!;
      insights.push({
        title: `Inefficient shift: ${worst.label}`,
        description: `${worst.label} runs $${worst.salesPerLaborHour.toFixed(0)} sales per labor hour at ${worst.laborPct.toFixed(1)}% labor.`,
        category: "STAFFING",
        severity: worst.laborPct > 35 ? "HIGH" : "MEDIUM",
        actionable: `Reduce ${worst.label} headcount or shift hours to match demand.`,
      });
    }

    if (lh.topPerformers.length > 0) {
      const top = lh.topPerformers[0]!;
      insights.push({
        title: `Top performer: ${top.name}`,
        description: `${top.name} (${top.role}) delivers $${top.salesPerLaborHour.toFixed(0)} sales/labor hr and ${top.guestsPerLaborHour.toFixed(1)} guests/hr.`,
        category: "STAFFING",
        severity: "LOW",
        actionable: "Schedule top performers during peak hours and use them to train others.",
      });
    }
  }

  const menu = snapshot.analytics?.menuEngineering;
  if (menu?.highlights) {
    const mh = menu.highlights;
    if (mh.promoteItems.length > 0) {
      insights.push({
        title: "What should we promote?",
        description: mh.promoteItems
          .slice(0, 3)
          .map((i) => `${i.name} (${i.quadrant}, ${i.marginPct.toFixed(0)}% margin)`)
          .join(", "),
        category: "MENU",
        severity: "LOW",
        actionable: "Feature stars on specials boards; train staff to suggest puzzles.",
      });
    }
    if (mh.repriceItems.length > 0) {
      const top = mh.repriceItems[0]!;
      insights.push({
        title: "What should we reprice?",
        description: `${top.name} at $${top.price.toFixed(2)} — popular (${top.quantitySold} sold) but only ${top.marginPct.toFixed(0)}% margin.`,
        category: "MENU",
        severity: "MEDIUM",
        actionable: `Test a 5–10% price increase on ${top.name} and monitor mix shift.`,
      });
    }
    if (mh.removeItems.length > 0) {
      insights.push({
        title: "What should we remove?",
        description: mh.removeItems
          .slice(0, 3)
          .map((i) => `${i.name} ($${i.contribution.toFixed(0)} contribution)`)
          .join(", "),
        category: "MENU",
        severity: mh.removeItems.length > 2 ? "MEDIUM" : "LOW",
        actionable: "Remove or rework dogs to simplify kitchen prep and reduce inventory SKUs.",
      });
    }
  }

  const marketing = snapshot.analytics?.marketing;
  if (marketing?.highlights) {
    const mh = marketing.highlights;
    insights.push({
      title: "Is marketing actually generating sales?",
      description: mh.salesGenerating.reason,
      category: "FINANCE",
      severity: mh.salesGenerating.status === "yes" ? "LOW" : mh.salesGenerating.status === "weak" ? "MEDIUM" : "HIGH",
      actionable:
        mh.salesGenerating.status === "yes"
          ? "Scale top ROAS campaigns and maintain attribution tracking."
          : "Pause low-ROAS campaigns and reallocate budget to proven channels.",
    });

    if (mh.profitableChannels.length > 0) {
      const top = mh.profitableChannels[0]!;
      insights.push({
        title: "Most profitable customer channel",
        description: `${top.channel} delivers $${top.profit.toFixed(0)} profit at ${top.marginPct.toFixed(1)}% margin (${top.orders} orders).`,
        category: "FINANCE",
        severity: "MEDIUM",
        actionable: `Invest in ${top.channel} acquisition and compare against lower-margin channels.`,
      });
    }
  }

  if (snapshot.lowStockItems.length > 0) {
    insights.push({
      title: "Low Inventory Alert",
      description: `${snapshot.lowStockItems.length} items are below minimum stock levels: ${snapshot.lowStockItems.map((i) => i.name).join(", ")}`,
      category: "INVENTORY",
      severity: snapshot.lowStockItems.length > 3 ? "HIGH" : "MEDIUM",
      actionable: "Reorder low-stock items immediately and review par levels.",
    });
  }

  if (snapshot.unavailableMenuItems.length > 0) {
    insights.push({
      title: "Unavailable Menu Items",
      description: `${snapshot.unavailableMenuItems.length} menu items are marked unavailable: ${snapshot.unavailableMenuItems.join(", ")}`,
      category: "MENU",
      severity: "MEDIUM",
      actionable: "Review unavailable items — restock ingredients or remove from menu.",
    });
  }

  if (snapshot.profitMargin < 0) {
    insights.push({
      title: "Negative Profit Margin",
      description: `Expenses ($${snapshot.monthlyExpenses.toFixed(2)}) exceed revenue ($${snapshot.weeklyRevenue.toFixed(2)}) this period.`,
      category: "FINANCE",
      severity: "CRITICAL",
      actionable: "Audit expenses, review pricing, and identify cost-cutting opportunities.",
    });
  }

  if (snapshot.weeklyOrders === 0) {
    insights.push({
      title: "No Recent Orders",
      description: "No orders recorded in the past week.",
      category: "OPERATIONS",
      severity: "HIGH",
      actionable: "Review marketing efforts and customer outreach strategies.",
    });
  }

  if (snapshot.activeStaff === 0) {
    insights.push({
      title: "No Active Staff",
      description: "No staff members are currently registered as active.",
      category: "STAFFING",
      severity: "HIGH",
      actionable: "Add staff members and assign roles for proper operations.",
    });
  }

  if (insights.length === 0) {
    insights.push({
      title: "Operations Running Smoothly",
      description: "No critical pain points detected. Continue monitoring key metrics.",
      category: "GENERAL",
      severity: "LOW",
      actionable: "Keep uploading photos and logging data for better AI insights.",
    });
  }

  return insights;
}

export async function runInsightAnalysis(locationId?: string): Promise<{
  count: number;
  criticalInsights: Array<{ title: string; description: string; severity: string }>;
}> {
  const locId = locationId || (await getLocationId());
  const insights = await generateBusinessInsights(locId);

  await prisma.businessInsight.deleteMany({
    where: { locationId: locId, resolved: false },
  });

  const created = await prisma.businessInsight.createMany({
    data: insights.map((insight) => ({
      locationId: locId,
      title: insight.title,
      description: insight.description,
      category: insight.category,
      severity: insight.severity,
      actionable: insight.actionable,
      dataSnapshot: JSON.stringify(insight),
    })),
  });

  await prisma.activityLog.create({
    data: {
      locationId: locId,
      action: "AI_ANALYSIS",
      entity: "insights",
      details: `Generated ${created.count} insights`,
    },
  });

  const criticalInsights = insights
    .filter((i) => i.severity === "CRITICAL" || i.severity === "HIGH")
    .map((i) => ({ title: i.title, description: i.description, severity: i.severity }));

  return { count: created.count, criticalInsights };
}
