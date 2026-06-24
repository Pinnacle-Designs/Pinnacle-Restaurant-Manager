import OpenAI from "openai";
import type { VisionScanOptions } from "@/lib/scan/parse-scan-form";
import { visionScanHint } from "@/lib/scan/parse-scan-form";
import { prisma } from "./prisma";
import { getLocationId } from "./location";
import { computeAnalytics, buildAnalyticsSnapshotForAI } from "./analytics/compute";
import {
  buildComplianceSnapshotForAI,
  generateComplianceInsights,
} from "./compliance/compliance-insights";
import type { InsightCategory, InsightSeverity } from "@prisma/client";

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

export async function analyzePhoto(
  imageBase64: string | string[],
  category: string,
  options?: VisionScanOptions & { pageCount?: number }
): Promise<{ description: string; tags: string[]; suggestedTitle: string }> {
  const images = Array.isArray(imageBase64) ? imageBase64 : [imageBase64];
  const multiPage = images.length > 1;
  const panoramic = options?.panoramic ?? false;

  if (!openai) {
    return {
      description: "AI analysis unavailable — set OPENAI_API_KEY in .env",
      tags: [category.toLowerCase()],
      suggestedTitle: `${category} photo`,
    };
  }

  try {
    const hint = visionScanHint(`restaurant photo (category: ${category})`, {
      panoramic,
      multiPage,
      pageCount: options?.pageCount ?? images.length,
    });

    const content: Array<
      | { type: "text"; text: string }
      | { type: "image_url"; image_url: { url: string } }
    > = [
      {
        type: "text",
        text: `${hint} Return JSON with: description (brief), tags (array of strings), suggestedTitle (short title). Focus on restaurant operations relevance.`,
      },
      ...images.map((b64) => ({
        type: "image_url" as const,
        image_url: { url: `data:image/jpeg;base64,${b64}` },
      })),
    ];

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content }],
      max_tokens: multiPage || panoramic ? 600 : 300,
      response_format: { type: "json_object" },
    });

    const responseContent = response.choices[0]?.message?.content;
    if (responseContent) {
      const parsed = JSON.parse(responseContent);
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

export async function analyzeReceipt(
  imageBase64: string | string[],
  options?: { panoramic?: boolean; multiPage?: boolean; pageCount?: number }
): Promise<ReceiptData> {
  const images = Array.isArray(imageBase64) ? imageBase64 : [imageBase64];
  const multiPage = options?.multiPage ?? images.length > 1;
  const panoramic = options?.panoramic ?? false;
  const pageCount = options?.pageCount ?? images.length;

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
      description:
        multiPage || panoramic
          ? "Long receipt (manual entry required — set OPENAI_API_KEY)"
          : "Receipt (manual entry required — set OPENAI_API_KEY)",
    };
  }

  try {
    const pageHint = `${visionScanHint("receipt", {
      panoramic,
      multiPage,
      pageCount,
    })} Return JSON with: description (vendor + brief summary), amount (total as number), category (one of: Food & Supplies, Utilities, Maintenance, Labor, Marketing, Equipment, Insurance, Other), date (YYYY-MM-DD), vendor (store name), items (array of line item strings). Use the total amount including tax.`;

    const content: Array<
      | { type: "text"; text: string }
      | { type: "image_url"; image_url: { url: string } }
    > = [
      {
        type: "text",
        text: pageHint,
      },
      ...images.map((b64) => ({
        type: "image_url" as const,
        image_url: { url: `data:image/jpeg;base64,${b64}` },
      })),
    ];

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content }],
      max_tokens: multiPage ? 1200 : panoramic ? 800 : 500,
      response_format: { type: "json_object" },
    });

    const responseContent = response.choices[0]?.message?.content;
    if (responseContent) {
      const parsed = JSON.parse(responseContent);
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

  const [inventory, menuItems, staff, recentOrders, expenses, recentPhotos, analyticsPayload, complianceSnapshot] =
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
      buildComplianceSnapshotForAI(locId),
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
    compliance: complianceSnapshot,
  };

  if (!openai) {
    const complianceInsights = await generateComplianceInsights(locId);
    return [...(await generateRuleBasedInsights(businessSnapshot)), ...complianceInsights];
  }

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are a restaurant business analyst with complete analytics across all 12 sections. Each section has keyQuestions and highlights — answer them with specific numbers. Sections: sales (what sells, busiest times, profitable channels), foodCost (disappearing product, cost drivers, recipes), labor (staffing, inefficient shifts, top performers), menuEngineering (promote, reprice, remove), marketing (generating sales, profitable channels), customerExperience (satisfaction hurts, complaint shifts), operations (bottlenecks, ticket time impact), purchasing (supplier increases, market rates), forecasting (Friday staff, all-item orders, catering demand, seasonal trends), profitability (profit leaks; profit by item, category, employee, shift, daypart, hour, day, location, channel, delivery, campaign), externalFactors (weather, events, holidays, sports, tourism, school, auto-learned patterns, weather forecast), executive (yesterday KPIs, alerts). The compliance object covers meal break deadlines, minor curfew/hour limits, and break waivers — flag CRITICAL labor law risks. Return JSON with insights array. Each insight: title, description, category (INVENTORY|STAFFING|FINANCE|OPERATIONS|MENU|CUSTOMER|FACILITY|GENERAL), severity (LOW|MEDIUM|HIGH|CRITICAL), actionable. Include insights for every section that has data.",
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

  return [...(await generateRuleBasedInsights(businessSnapshot)), ...(await generateComplianceInsights(locId))];
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

  const customer = snapshot.analytics?.customerExperience;
  if (customer?.highlights) {
    const ch = customer.highlights;
    if (ch.satisfactionHurts.length > 0) {
      const top = ch.satisfactionHurts[0]!;
      insights.push({
        title: "What is hurting guest satisfaction?",
        description: `${top.issue} leads with ${top.count} mentions at ${top.avgRating.toFixed(1)}★ average.`,
        category: "CUSTOMER",
        severity: top.avgRating < 3.5 ? "HIGH" : "MEDIUM",
        actionable: `Address ${top.issue} with staff training and process fixes this week.`,
      });
    }

    if (ch.complaintHotspots.length > 0) {
      const hotspot = ch.complaintHotspots[0]!;
      insights.push({
        title: "Shift with most complaints",
        description: `${hotspot.label} shift has ${hotspot.count} negative reviews${hotspot.topCategory ? ` — mostly ${hotspot.topCategory}` : ""}.`,
        category: "CUSTOMER",
        severity: hotspot.count >= 2 ? "HIGH" : "MEDIUM",
        actionable: `Review staffing and service standards during ${hotspot.label} service.`,
      });
    }
  }

  const operations = snapshot.analytics?.operations;
  if (operations?.highlights) {
    const oh = operations.highlights;
    if (oh.bottlenecks.length > 0) {
      const bn = oh.bottlenecks[0]!;
      insights.push({
        title: "Where are bottlenecks?",
        description: `${bn.label} averages ${bn.avgTicketMinutes.toFixed(0)} min across ${bn.orders} orders.`,
        category: "OPERATIONS",
        severity: bn.avgTicketMinutes > 25 ? "HIGH" : "MEDIUM",
        actionable: `Add kitchen capacity or prep ahead for ${bn.label} peak.`,
      });
    }

    insights.push({
      title: "Are long ticket times hurting sales?",
      description: oh.ticketTimeImpact.reason,
      category: "OPERATIONS",
      severity: oh.ticketTimeImpact.status === "hurting" ? "HIGH" : "MEDIUM",
      actionable:
        oh.ticketTimeImpact.status === "hurting"
          ? "Reduce ticket times on slow dayparts and review line staffing."
          : "Maintain current ticket time targets and monitor during peak volume.",
    });
  }

  const purchasing = snapshot.analytics?.purchasing;
  if (purchasing?.highlights) {
    const ph = purchasing.highlights;
    if (ph.costIncreaseSuppliers.length > 0) {
      const top = ph.costIncreaseSuppliers[0]!;
      insights.push({
        title: "Supplier cost increase",
        description: `${top.vendor} up ${top.changePct.toFixed(1)}% ($${top.spend.toFixed(0)} spend).`,
        category: "FINANCE",
        severity: top.changePct > 7 ? "HIGH" : "MEDIUM",
        actionable: `Renegotiate with ${top.vendor} or source alternatives.`,
      });
    }
    if (ph.marketRateStatus.status === "above") {
      insights.push({
        title: "Above market rates",
        description: ph.marketRateStatus.reason,
        category: "FINANCE",
        severity: "MEDIUM",
        actionable: "Run vendor comparison and switch where savings exceed 5%.",
      });
    }
  }

  const forecasting = snapshot.analytics?.forecasting;
  if (forecasting?.highlights) {
    const fh = forecasting.highlights;
    insights.push({
      title: "How much staff do I need next Friday?",
      description: `${fh.staffNeededNextFriday.hours.toFixed(0)} labor hours projected for ${fh.staffNeededNextFriday.date} ($${fh.staffNeededNextFriday.predictedSales.toFixed(0)} predicted sales).`,
      category: "STAFFING",
      severity: "LOW",
      actionable: "Publish the Friday schedule 5 days ahead.",
    });
    insights.push({
      title: "How much of every item should I order tomorrow?",
      description:
        fh.inventoryOrderTomorrow.length > 0
          ? fh.inventoryOrderTomorrow
              .map((i) => `${i.name}: order ${i.quantity} ${i.unit} (${i.onHand} on hand)`)
              .join("; ")
          : "No inventory items tracked.",
      category: "INVENTORY",
      severity: fh.inventoryOrderTomorrow.filter((i) => i.quantity > 0).length > 3 ? "HIGH" : "MEDIUM",
      actionable: "Place vendor orders today for items with the highest order quantities.",
    });
    insights.push({
      title: "Catering demand forecast",
      description: `${fh.cateringDemandNext7d.orders} orders and $${fh.cateringDemandNext7d.sales.toFixed(0)} sales projected (trend: ${fh.cateringDemandNext7d.trend}).`,
      category: "OPERATIONS",
      severity: fh.cateringDemandNext7d.trend === "up" ? "MEDIUM" : "LOW",
      actionable: "Prep catering menus and assign dedicated staff for high-volume catering days.",
    });
    insights.push({
      title: "Seasonal trend",
      description: `${fh.seasonalTrend.pattern}: ${fh.seasonalTrend.insight}`,
      category: "GENERAL",
      severity: Math.abs(fh.seasonalTrend.liftPct) > 15 ? "MEDIUM" : "LOW",
      actionable: `Staff and inventory up for peak day (${fh.seasonalTrend.peakDay}).`,
    });
  }

  const profitability = snapshot.analytics?.profitability;
  if (profitability?.highlights) {
    const prh = profitability.highlights;
    if (prh.profitLeaks.length > 0) {
      const leak = prh.profitLeaks[0]!;
      insights.push({
        title: "Where is profit leaking?",
        description: `${leak.area}: $${leak.amount.toFixed(0)} — ${leak.reason}.`,
        category: "FINANCE",
        severity: "MEDIUM",
        actionable: `Tighten controls on ${leak.area.toLowerCase()}.`,
      });
    }
    insights.push({
      title: "Which menu items, hours, days, and channels drive profit?",
      description: [
        prh.topProfitItem ? `${prh.topProfitItem.name} ($${prh.topProfitItem.profit.toFixed(0)})` : null,
        prh.topProfitHour ? `${prh.topProfitHour.label} ($${prh.topProfitHour.profit.toFixed(0)})` : null,
        prh.topProfitDay ? `${prh.topProfitDay.date} ($${prh.topProfitDay.profit.toFixed(0)})` : null,
        prh.topProfitChannel ? `${prh.topProfitChannel.channel} ($${prh.topProfitChannel.profit.toFixed(0)})` : null,
      ]
        .filter(Boolean)
        .join("; ") || "Add paid orders to unlock profit breakdowns.",
      category: "FINANCE",
      severity: "MEDIUM",
      actionable: "Promote high-profit items during peak hours and channels.",
    });
    insights.push({
      title: "Which employees, shifts, and campaigns are most profitable?",
      description: [
        prh.topProfitEmployee ? `${prh.topProfitEmployee.name} ($${prh.topProfitEmployee.profit.toFixed(0)})` : null,
        prh.lowestProfitShift ? `Weakest shift ${prh.lowestProfitShift.shift}` : null,
        prh.topCampaign ? `${prh.topCampaign.name} ($${prh.topCampaign.profit.toFixed(0)})` : null,
      ]
        .filter(Boolean)
        .join("; ") || "Schedule and campaign data needed.",
      category: "FINANCE",
      severity: "LOW",
      actionable: "Staff peak-profit shifts with top performers and scale winning campaigns.",
    });
  }

  const external = snapshot.analytics?.externalFactors;
  if (external?.highlights) {
    const eh = external.highlights;
    if (eh.weatherImpact) {
      insights.push({
        title: "How does weather affect sales and delivery?",
        description: `${eh.weatherImpact.insight}${eh.weatherImpact.deliveryShiftPct != null ? ` Delivery shift ~${eh.weatherImpact.deliveryShiftPct.toFixed(0)}%.` : ""}`,
        category: "GENERAL",
        severity: Math.abs(eh.weatherImpact.avgImpactPct) > 15 ? "MEDIUM" : "LOW",
        actionable: "Staff delivery on rainy forecast days and reduce dine-in prep.",
      });
    }
    if (eh.topEvents.length > 0) {
      insights.push({
        title: "Which local events, holidays, and sports games boost traffic?",
        description: eh.topEvents
          .slice(0, 3)
          .map((ev) => `${ev.description} (+${ev.impactPct.toFixed(0)}%)`)
          .join("; "),
        category: "GENERAL",
        severity: "LOW",
        actionable: "Staff up and promote specials during high-impact event windows.",
      });
    }
    if (eh.learnedPatterns.length > 0) {
      insights.push({
        title: "Auto-learned external patterns",
        description: eh.learnedPatterns
          .slice(0, 3)
          .map((p) => p.insight)
          .join("; "),
        category: "GENERAL",
        severity: "MEDIUM",
        actionable: "Bake learned patterns into forecasting and staffing plans.",
      });
    }
    if (external.weatherForecast?.length) {
      const rainyDays = external.weatherForecast.filter((f) => f.isRainy).length;
      if (rainyDays > 0) {
        insights.push({
          title: "Upcoming rainy days",
          description: `${rainyDays} rainy day(s) forecast via ${external.weatherSource ?? "weather API"}${external.weatherGeo ? ` (${external.weatherGeo})` : ""} — plan for delivery lift.`,
          category: "OPERATIONS",
          severity: "MEDIUM",
          actionable: "Add delivery drivers and promote comfort food on rainy days.",
        });
      }
    }
    for (const cov of eh.categoryCoverage?.filter((c) => c.learned) ?? []) {
      const pattern = eh.learnedPatterns.find((p) => p.category === cov.category);
      if (pattern) {
        insights.push({
          title: `${cov.label}: ${pattern.pattern}`,
          description: pattern.insight,
          category: "GENERAL",
          severity: pattern.confidence === "high" ? "MEDIUM" : "LOW",
          actionable: `Adjust staffing and inventory when ${cov.label.toLowerCase()} factors are active.`,
        });
      }
    }
  }

  const executive = snapshot.analytics?.executive;
  if (executive?.yesterday) {
    const y = executive.yesterday;
    insights.push({
      title: "Yesterday performance",
      description: `Net sales $${y.netSales.toFixed(0)}, prime cost ${y.primeCostPct.toFixed(1)}%, est. profit $${y.profitEstimate.toFixed(0)} from ${y.guestCount} guests.`,
      category: "FINANCE",
      severity: y.primeCostPct > 65 ? "HIGH" : "LOW",
      actionable: "Review yesterday's prime cost breakdown and address any alerts.",
    });
  }
  for (const alert of snapshot.analytics?.executiveAlerts ?? []) {
    insights.push({
      title: alert.message,
      description: `Executive alert (${alert.type}) requires attention.`,
      category: alert.type === "INVENTORY" ? "INVENTORY" : alert.type === "STAFFING" ? "STAFFING" : "OPERATIONS",
      severity: alert.severity as InsightSeverity,
      actionable: "Resolve this alert before the next service period.",
    });
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
