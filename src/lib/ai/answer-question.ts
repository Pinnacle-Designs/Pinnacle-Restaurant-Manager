import OpenAI from "openai";
import { getLocationId } from "../location";
import { buildAnalyticsSnapshotForAI } from "../analytics/compute";
import {
  DASHBOARD_AI_COMMANDS,
  matchPromptCategory,
  type DashboardCommandId,
} from "./manager-prompts";
import {
  buildCommandCenterSnapshot,
  buildLiveSignals,
  detectCommandIntent,
  runCommandCenterAnalysis,
  type CommandCenterFinding,
  type CommandCenterMetric,
  type CommandCenterResponse,
  type CommandCenterSignal,
  type CommandIntent,
  DOMAIN_LABELS,
} from "./command-center";

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

export interface ManagerAnswer {
  question: string;
  answer: string;
  categoryId: string;
  categoryLabel: string;
  confidence: "high" | "medium" | "low";
  sources: string[];
  relatedActions: string[];
  usedAI: boolean;
  /** Command center structured response */
  mode?: "command_center" | "chat";
  headline?: string;
  summary?: string;
  intent?: string;
  signals?: CommandCenterSignal[];
  findings?: CommandCenterFinding[];
  metrics?: CommandCenterMetric[];
  domainsScanned?: string[];
}

export type { CommandCenterSignal, CommandCenterFinding, CommandCenterMetric };

function asCommandCenterAnswer(response: CommandCenterResponse): ManagerAnswer {
  return response;
}

function enrichWithCommandCenter(
  base: ManagerAnswer,
  snapshot: Awaited<ReturnType<typeof buildCommandCenterSnapshot>>,
  intent?: CommandIntent
): ManagerAnswer {
  return {
    ...base,
    mode: "command_center",
    headline: base.headline ?? base.answer.split("\n")[0]?.replace(/^#+\s*/, ""),
    summary:
      base.summary ??
      `${fmtMoney(snapshot.sales.netSales)} sales · ${fmtPct(snapshot.profitability.marginPct)} margin`,
    intent: intent ?? "general",
    signals: base.signals ?? buildLiveSignals(snapshot),
    findings: base.findings,
    metrics:
      base.metrics ??
      buildLiveSignals(snapshot).map((s) => ({
        label: s.label,
        value: s.value,
        subtext: s.detail,
      })),
    domainsScanned:
      base.domainsScanned ??
      ["sales", "labor", "inventory", "scheduling", "vendors", "waste", "reviews", "employees"],
    sources: base.sources.length ? base.sources : [...Object.values(DOMAIN_LABELS)],
  };
}

async function buildManagerContext(locationId: string) {
  const snapshot = await buildCommandCenterSnapshot(locationId);
  return ctxFromSnapshot(snapshot);
}

function ctxFromSnapshot(snapshot: Awaited<ReturnType<typeof buildCommandCenterSnapshot>>) {
  return {
    inventoryCount: snapshot.inventory.lowStockCount,
    lowStockItems: snapshot.inventory.lowStockItems.map((name) => ({
      name,
      quantity: 0,
      min: 0,
    })),
    menuItemCount: snapshot.inventory.unavailableMenu.length,
    unavailableMenuItems: snapshot.inventory.unavailableMenu,
    activeStaff: snapshot.employees.activeCount,
    weeklyOrders: snapshot.sales.orderCount,
    weeklyRevenue: snapshot.sales.netSales,
    monthlyExpenses: snapshot.vendors.totalSpend,
    profitMargin: snapshot.profitability.netProfit,
    analytics: snapshot.analytics,
    rawAnalytics: snapshot.rawAnalytics,
    commandCenter: snapshot,
  };
}

function fmtMoney(n: number) {
  return `$${n.toFixed(0)}`;
}

function fmtPct(n: number) {
  return `${n.toFixed(1)}%`;
}

function resolveDashboardCommand(question: string): DashboardCommandId | null {
  const q = question.toLowerCase().trim();
  for (const cmd of DASHBOARD_AI_COMMANDS) {
    if (q === cmd.question.toLowerCase() || q.includes(cmd.label.toLowerCase())) {
      return cmd.id;
    }
  }
  return null;
}

function pickKeyQuestions(
  analytics: ReturnType<typeof buildAnalyticsSnapshotForAI>,
  sections: string[]
): string[] {
  const out: string[] = [];
  const map: Record<string, { keyQuestions?: string[] } | undefined> = {
    sales: analytics.sales,
    foodCost: analytics.foodCost,
    labor: analytics.labor,
    menuEngineering: analytics.menuEngineering,
    profitability: analytics.profitability,
    purchasing: analytics.purchasing,
    forecasting: analytics.forecasting,
    externalFactors: analytics.externalFactors,
    marketing: analytics.marketing,
    customerExperience: analytics.customerExperience,
    operations: analytics.operations,
  };
  for (const s of sections) {
    const section = map[s];
    if (section?.keyQuestions) out.push(...section.keyQuestions.slice(0, 3));
  }
  return out;
}

function answerDashboardCommand(
  commandId: DashboardCommandId,
  ctx: Awaited<ReturnType<typeof buildManagerContext>>
): ManagerAnswer | null {
  const a = ctx.analytics;
  const y = a.executive?.yesterday;
  const actions: string[] = [];

  switch (commandId) {
    case "daily_briefing": {
      const lines = [
        "## Daily Briefing",
        "",
        y
          ? `**Yesterday:** Net sales ${fmtMoney(y.netSales)}, ${y.guestCount} guests, prime cost ${fmtPct(y.primeCostPct)}, est. profit ${fmtMoney(y.profitEstimate)}.`
          : "**Yesterday:** No closed-day data yet.",
        `**Sales (period):** Net ${fmtMoney(a.sales.netSales)}, avg check ${fmtMoney(a.sales.averageCheck)}, ${a.sales.guestCount} guests.`,
        `**Labor:** ${fmtPct(a.labor.laborPct)} of sales · ${a.labor.actualHours.toFixed(0)} actual hrs vs ${a.labor.scheduledHours.toFixed(0)} scheduled · OT ${a.labor.overtimeHours.toFixed(1)} hrs.`,
        `**Food cost:** ${fmtPct(a.foodCost.foodCostPct)} · waste ${fmtMoney(a.foodCost.wasteCost)} · ${ctx.lowStockItems.length} low-stock SKUs.`,
        `**Staffing:** ${ctx.activeStaff} active staff · status: ${a.labor.highlights?.staffingStatus ?? "review schedule"}.`,
        `**Guest service:** Avg rating ${a.customerExperience.avgRating.toFixed(1)}/5 (${a.customerExperience.reviewCount} reviews) · ticket time ${a.operations.avgTicketTimeMinutes.toFixed(0)} min.`,
      ];
      if (a.executiveAlerts?.length) {
        lines.push("", "**Alerts:**");
        for (const alert of a.executiveAlerts.slice(0, 4)) {
          lines.push(`- ${alert.message}`);
          actions.push(alert.message);
        }
      }
      return {
        question: DASHBOARD_AI_COMMANDS.find((c) => c.id === commandId)!.question,
        answer: lines.join("\n"),
        categoryId: "daily_overview",
        categoryLabel: "Daily Manager Overview",
        confidence: "high",
        sources: ["executive", "sales", "labor", "foodCost", "customerExperience"],
        relatedActions: actions,
        usedAI: false,
      };
    }

    case "find_problems": {
      const problems: string[] = [];
      for (const alert of a.executiveAlerts ?? []) problems.push(alert.message);
      if (ctx.lowStockItems.length)
        problems.push(
          `${ctx.lowStockItems.length} items below par: ${ctx.lowStockItems.map((i) => i.name).join(", ")}`
        );
      if (ctx.unavailableMenuItems.length)
        problems.push(`Unavailable menu: ${ctx.unavailableMenuItems.join(", ")}`);
      if (a.foodCost.highlights?.productDisappearing)
        problems.push(
          `Product variance: ${a.foodCost.highlights.productDisappearing.primaryCause} (${a.foodCost.highlights.productDisappearing.varianceGapPct.toFixed(0)}% gap)`
        );
      if (a.labor.highlights?.inefficientShifts?.length)
        problems.push(
          `Inefficient shifts: ${a.labor.highlights.inefficientShifts.slice(0, 2).map((s) => s.label).join(", ")}`
        );
      if (a.operations.highlights?.bottlenecks?.length)
        problems.push(`Kitchen bottlenecks: ${a.operations.highlights.bottlenecks.slice(0, 2).map((b) => b.label).join(", ")}`);
      if (a.customerExperience.highlights?.complaintHotspots?.length)
        problems.push(
          `Complaint hotspots: ${a.customerExperience.highlights.complaintHotspots.slice(0, 2).map((c) => c.label).join(", ")}`
        );
      if (problems.length === 0) problems.push("No critical issues detected — keep monitoring KPIs.");
      return {
        question: DASHBOARD_AI_COMMANDS.find((c) => c.id === commandId)!.question,
        answer: `## Needs Attention\n\n${problems.map((p, i) => `${i + 1}. ${p}`).join("\n")}`,
        categoryId: "daily_overview",
        categoryLabel: "Daily Manager Overview",
        confidence: problems.length > 1 ? "high" : "medium",
        sources: ["executive", "foodCost", "labor", "operations", "customerExperience"],
        relatedActions: problems.slice(0, 5),
        usedAI: false,
      };
    }

    case "improve_profit": {
      const tips: string[] = [];
      const h = a.profitability.highlights;
      if (h?.topProfitItem)
        tips.push(`Push high-margin winner **${h.topProfitItem.name}** (${fmtMoney(h.topProfitItem.profit)} profit).`);
      if (a.menuEngineering.highlights?.repriceItems?.length)
        tips.push(
          `Reprice: ${a.menuEngineering.highlights.repriceItems.slice(0, 3).map((i) => i.name).join(", ")}.`
        );
      if (a.menuEngineering.highlights?.removeItems?.length)
        tips.push(
          `Remove dogs: ${a.menuEngineering.highlights.removeItems.slice(0, 3).map((i) => i.name).join(", ")}.`
        );
      if (a.foodCost.wasteCost > 0)
        tips.push(`Cut waste (${fmtMoney(a.foodCost.wasteCost)} this period) — review prep pars and 86 timing.`);
      if (a.labor.laborPct > 32)
        tips.push(`Labor at ${fmtPct(a.labor.laborPct)} — trim ${a.labor.highlights?.inefficientShifts?.[0]?.label ?? "slow shifts"}.`);
      if (a.operations.discountRatePct > 3)
        tips.push(`Discount rate ${fmtPct(a.operations.discountRatePct)} — audit comps and promos.`);
      if (tips.length === 0)
        tips.push("Margins look stable — focus on stars and upselling to grow profit.");
      return {
        question: DASHBOARD_AI_COMMANDS.find((c) => c.id === commandId)!.question,
        answer: `## Fastest Profit Wins This Week\n\n${tips.map((t, i) => `${i + 1}. ${t}`).join("\n")}`,
        categoryId: "profit_cost",
        categoryLabel: "Profit & Cost Control",
        confidence: "high",
        sources: ["profitability", "menuEngineering", "foodCost", "labor"],
        relatedActions: tips,
        usedAI: false,
      };
    }

    case "build_schedule": {
      const fc = a.forecasting;
      const next = fc.salesForecast7d?.[0];
      const laborFc = fc.laborHoursForecast7d?.[0];
      const fri = fc.highlights?.staffNeededNextFriday;
      const lines = [
        "## Suggested Schedule Focus",
        "",
        next
          ? `**Next forecast day:** ${next.date} — projected ${fmtMoney(next.predicted)} sales.`
          : "**Forecast:** Add more order history for day-of-week projections.",
        laborFc ? `**Labor hours target:** ~${laborFc.hours.toFixed(0)} hours on ${laborFc.date}.` : "",
        fri
          ? `**Next Friday:** ${fmtMoney(fri.predictedSales)} sales → ~${fri.hours.toFixed(0)} labor hours.`
          : "",
        `**Current labor %:** ${fmtPct(a.labor.laborPct)} · staffing: ${a.labor.highlights?.staffingStatus ?? "review"}.`,
      ];
      if (a.labor.highlights?.topPerformers?.length) {
        lines.push(
          "",
          "**Schedule top performers on peak:**",
          ...a.labor.highlights.topPerformers.slice(0, 4).map(
            (e) => `- ${e.name}: $${e.salesPerLaborHour.toFixed(0)}/labor hr`
          )
        );
      }
      if (a.labor.byShift?.length) {
        lines.push("", "**Shift efficiency:**");
        for (const s of a.labor.byShift.slice(0, 3)) {
          lines.push(`- ${s.label}: ${fmtPct(s.laborPct)} labor, ${fmtMoney(s.sales)} sales`);
        }
      }
      return {
        question: DASHBOARD_AI_COMMANDS.find((c) => c.id === commandId)!.question,
        answer: lines.filter(Boolean).join("\n"),
        categoryId: "scheduling_labor",
        categoryLabel: "Scheduling & Labor",
        confidence: next ? "high" : "medium",
        sources: ["forecasting", "labor"],
        relatedActions: [
          laborFc ? `Staff ~${laborFc.hours.toFixed(0)} hours on ${laborFc.date}` : "Review tomorrow's forecast",
        ],
        usedAI: false,
      };
    }

    case "order_inventory": {
      const orderList = a.forecasting.highlights?.inventoryOrderTomorrow ?? [];
      const recs = a.forecasting.inventoryRecommendations ?? [];
      const low = ctx.lowStockItems;
      const lines = ["## Suggested Order", ""];
      if (orderList.length) {
        lines.push(`**Order for ${a.forecasting.highlights?.inventoryOrderDate ?? "tomorrow"}:**`);
        for (const r of orderList.slice(0, 12)) {
          lines.push(`- ${r.name}: order **${r.quantity}** ${r.unit} (on hand ${r.onHand})`);
        }
      } else if (recs.length) {
        lines.push("**Forecast-based order:**");
        for (const r of recs.slice(0, 12)) {
          lines.push(`- ${r.name}: order **${r.suggestedOrder}** ${r.unit}`);
        }
      }
      if (low.length) {
        lines.push("", "**Below minimum now:**");
        for (const i of low.slice(0, 8)) {
          lines.push(`- ${i.name}: ${i.quantity} on hand (min ${i.min})`);
        }
      }
      if (!recs.length && !orderList.length && !low.length) lines.push("Inventory levels look healthy — no urgent orders.");
      return {
        question: DASHBOARD_AI_COMMANDS.find((c) => c.id === commandId)!.question,
        answer: lines.join("\n"),
        categoryId: "inventory",
        categoryLabel: "Inventory",
        confidence: recs.length || orderList.length || low.length ? "high" : "medium",
        sources: ["forecasting", "foodCost"],
        relatedActions: (orderList.length ? orderList : recs)
          .slice(0, 5)
          .map((r) =>
            "quantity" in r
              ? `Order ${r.quantity} ${r.unit} of ${r.name}`
              : `Order ${r.suggestedOrder} ${r.unit} of ${r.name}`
          ),
        usedAI: false,
      };
    }

    case "reduce_waste": {
      const lines = ["## Waste & Loss Opportunities", ""];
      lines.push(`**Recorded waste cost:** ${fmtMoney(a.foodCost.wasteCost)} · spoilage ${fmtMoney(a.foodCost.spoilageCost)}.`);
      if (a.foodCost.wasteByReason?.length) {
        lines.push("", "**By reason:**");
        for (const w of a.foodCost.wasteByReason.slice(0, 5)) {
          lines.push(`- ${w.reason}: ${fmtMoney(w.cost)}`);
        }
      }
      if (a.foodCost.highlights?.productDisappearing) {
        const p = a.foodCost.highlights.productDisappearing;
        lines.push(
          "",
          `**Variance driver:** ${p.primaryCause} (${p.varianceGapPct.toFixed(0)}% gap · waste ${fmtMoney(p.wasteCost)} · spoilage ${fmtMoney(p.spoilageCost)})`
        );
      }
      if (a.menuEngineering.highlights?.removeItems?.length) {
        lines.push(
          "",
          `**Low sellers to cut prep on:** ${a.menuEngineering.highlights.removeItems.slice(0, 4).map((i) => i.name).join(", ")}`
        );
      }
      return {
        question: DASHBOARD_AI_COMMANDS.find((c) => c.id === commandId)!.question,
        answer: lines.join("\n"),
        categoryId: "theft_waste",
        categoryLabel: "Theft, Waste & Loss Prevention",
        confidence: "high",
        sources: ["foodCost", "menuEngineering"],
        relatedActions: ["Audit waste logs", "Review prep quantities for slow movers"],
        usedAI: false,
      };
    }

    case "coach_employees": {
      const lines = ["## Coaching Priorities", ""];
      const needsCoaching = a.labor.byEmployee?.filter((e) => e.salesPerLaborHour < 80) ?? [];
      if (needsCoaching.length) {
        lines.push("**Lower sales per labor hour — coach on upselling & table turns:**");
        for (const e of needsCoaching.slice(0, 5)) {
          lines.push(
            `- ${e.name}: ${fmtMoney(e.salesAttributed)} sales, ${e.actualHours.toFixed(1)} hrs ($${e.salesPerLaborHour.toFixed(0)}/hr)`
          );
        }
      }
      if (a.labor.highlights?.topPerformers?.length) {
        lines.push("", "**Top performers to recognize:**");
        for (const e of a.labor.highlights.topPerformers.slice(0, 3)) {
          lines.push(`- ${e.name}: $${e.salesPerLaborHour.toFixed(0)}/labor hr`);
        }
      }
      if (a.profitability.byEmployee?.length) {
        const lowProfit = [...a.profitability.byEmployee].sort((x, y) => x.profit - y.profit).slice(0, 3);
        lines.push("", "**Lowest profit contribution:**");
        for (const e of lowProfit) {
          lines.push(`- ${e.name}: ${fmtMoney(e.profit)} profit on ${fmtMoney(e.sales)} sales`);
        }
      }
      if (lines.length <= 2) lines.push("No strong coaching signals — continue regular 1:1s.");
      return {
        question: DASHBOARD_AI_COMMANDS.find((c) => c.id === commandId)!.question,
        answer: lines.join("\n"),
        categoryId: "employee_performance",
        categoryLabel: "Employee Performance",
        confidence: "medium",
        sources: ["labor", "profitability"],
        relatedActions: ["Schedule coaching 1:1s for underperformers", "Recognize top performers"],
        usedAI: false,
      };
    }

    case "boost_sales": {
      const lines = ["## Sales Boost Ideas for Today", ""];
      if (a.menuEngineering.highlights?.promoteItems?.length) {
        lines.push(
          `**Promote:** ${a.menuEngineering.highlights.promoteItems.slice(0, 4).map((i) => i.name).join(", ")}`
        );
      }
      if (a.sales.highlights?.busiestHour) {
        lines.push(
          `**Peak revenue hour:** ${a.sales.highlights.busiestHour.hour}:00 — staff for upsells.`
        );
      }
      if (a.marketing.highlights?.salesGenerating) {
        const sg = a.marketing.highlights.salesGenerating;
        lines.push(`**Marketing:** ${sg.reason} (${fmtMoney(sg.attributedRevenue)} attributed, ROAS ${sg.returnOnAdSpend.toFixed(1)}x)`);
      }
      if (a.externalFactors.learnedPatterns?.length) {
        const p = a.externalFactors.learnedPatterns[0];
        lines.push(`**External lift:** ${p.pattern} → ${p.impactPct > 0 ? "+" : ""}${p.impactPct.toFixed(0)}% ${p.metric}`);
      }
      lines.push(
        "",
        "**Server upsells:** Suggest add-ons on stars, bundle a puzzle item with a popular entrée, feature today's special at handoff."
      );
      return {
        question: DASHBOARD_AI_COMMANDS.find((c) => c.id === commandId)!.question,
        answer: lines.join("\n"),
        categoryId: "sales_revenue",
        categoryLabel: "Sales & Revenue",
        confidence: "high",
        sources: ["menuEngineering", "sales", "marketing", "externalFactors"],
        relatedActions: ["Brief servers on promote list", "Post today's special on social"],
        usedAI: false,
      };
    }

    case "prepare_rush": {
      const peak = a.sales.highlights?.busiestDaypart ?? a.sales.byDaypart?.sort((x, y) => y.sales - x.sales)[0];
      const lines = [
        "## Rush Prep Checklist",
        "",
        peak ? `**Busiest daypart:** ${peak.daypart} (${fmtMoney(peak.sales)}).` : "",
        `**Avg ticket time:** ${a.operations.avgTicketTimeMinutes.toFixed(0)} min.`,
      ];
      if (a.operations.highlights?.bottlenecks?.length) {
        lines.push(`**Bottlenecks:** ${a.operations.highlights.bottlenecks.map((b) => b.label).join(", ")}`);
      }
      if (a.foodCost.lowStockItems?.length) {
        lines.push(`**86 risk:** ${a.foodCost.lowStockItems.map((i) => i.name).join(", ")}`);
      }
      if (a.labor.highlights?.staffingStatus) {
        lines.push(`**Staffing:** ${a.labor.highlights.staffingStatus}`);
      }
      lines.push(
        "",
        "**Before rush:**",
        "1. Pre-batch mise for top 5 sellers",
        "2. Assign expo + strongest line on bottleneck station",
        "3. Confirm low-stock substitutes or 86 list",
        "4. Brief FOH on push items and wait-time script"
      );
      return {
        question: DASHBOARD_AI_COMMANDS.find((c) => c.id === commandId)!.question,
        answer: lines.filter(Boolean).join("\n"),
        categoryId: "kitchen_operations",
        categoryLabel: "Kitchen Operations",
        confidence: "high",
        sources: ["operations", "sales", "foodCost", "labor"],
        relatedActions: ["Complete mise en place", "Verify staffing for peak"],
        usedAI: false,
      };
    }

    case "owner_report": {
      const lines = [
        "## Owner Report",
        "",
        y
          ? `**Yesterday:** Sales ${fmtMoney(y.netSales)} · Prime ${fmtPct(y.primeCostPct)} · Profit ${fmtMoney(y.profitEstimate)}`
          : "",
        `**Period sales:** ${fmtMoney(a.sales.netSales)} · Avg check ${fmtMoney(a.sales.averageCheck)}`,
        `**Food cost:** ${fmtPct(a.foodCost.foodCostPct)} · **Labor:** ${fmtPct(a.labor.laborPct)} · **Prime:** ${fmtPct((a.foodCost.foodCostPct + a.labor.laborPct))}`,
        `**Est. net profit:** ${fmtMoney(a.profitability.netProfitEstimate)} (${fmtPct(a.profitability.profitMarginPct)} margin)`,
        `**Guest satisfaction:** ${a.customerExperience.avgRating.toFixed(1)}/5`,
        "",
        "**Top issues:**",
      ];
      const issues = (a.executiveAlerts ?? []).slice(0, 4).map((al) => al.message);
      if (!issues.length) issues.push("No critical alerts");
      lines.push(...issues.map((i) => `- ${i}`));
      lines.push("", "**Recommendations:**");
      const recs = pickKeyQuestions(a, ["profitability", "menuEngineering", "labor"]).slice(0, 4);
      lines.push(...(recs.length ? recs.map((r) => `- ${r}`) : ["- Continue monitoring prime cost and guest scores"]));
      return {
        question: DASHBOARD_AI_COMMANDS.find((c) => c.id === commandId)!.question,
        answer: lines.filter(Boolean).join("\n"),
        categoryId: "owner_level",
        categoryLabel: "Owner-Level Questions",
        confidence: "high",
        sources: ["executive", "profitability", "sales", "labor", "foodCost"],
        relatedActions: issues,
        usedAI: false,
      };
    }

    default:
      return null;
  }
}

function answerFromKeyQuestions(
  question: string,
  category: { id: string; label: string; sections: string[] },
  ctx: Awaited<ReturnType<typeof buildManagerContext>>
): ManagerAnswer | null {
  const a = ctx.analytics;
  const qLower = question.toLowerCase();

  const tryMatch = (patterns: RegExp[], sectionKey: keyof typeof a, answerFn: () => string) => {
    if (patterns.some((p) => p.test(qLower))) {
      const section = a[sectionKey] as { keyQuestions?: string[] } | undefined;
      const kq = section?.keyQuestions ?? [];
      const body = answerFn();
      return {
        question,
        answer: kq.length ? `${body}\n\n**Related insights:**\n${kq.map((k) => `- ${k}`).join("\n")}` : body,
        categoryId: category.id,
        categoryLabel: category.label,
        confidence: "medium" as const,
        sources: [String(sectionKey)],
        relatedActions: kq.slice(0, 3),
        usedAI: false,
      };
    }
    return null;
  };

  const foodCost = tryMatch(
    [/food cost|prime cost|labor cost|margin|profit|losing money|break-even/i],
    "profitability",
    () => {
      const prime = a.foodCost.foodCostPct + a.labor.laborPct;
      return `Food cost **${fmtPct(a.foodCost.foodCostPct)}**, labor **${fmtPct(a.labor.laborPct)}**, prime **${fmtPct(prime)}**. Est. profit **${fmtMoney(a.profitability.netProfitEstimate)}** (${fmtPct(a.profitability.profitMarginPct)} margin).`;
    }
  );
  if (foodCost) return foodCost;

  const sales = tryMatch(
    [/sales|revenue|ticket size|best-selling|worst-selling|day of the week/i],
    "sales",
    () =>
      `Net sales **${fmtMoney(a.sales.netSales)}**, avg check **${fmtMoney(a.sales.averageCheck)}**, ${a.sales.guestCount} guests. Top item: **${a.sales.topMenuItems[0]?.name ?? "—"}**.`
  );
  if (sales) return sales;

  const inventory = tryMatch(
    [/inventory|order today|running low|overstock|waste|prep more|prep less/i],
    "foodCost",
    () => {
      const low = ctx.lowStockItems.map((i) => i.name).join(", ") || "none";
      return `**${ctx.lowStockItems.length}** items below par (${low}). Waste cost **${fmtMoney(a.foodCost.wasteCost)}**. Turnover **${a.foodCost.inventoryTurnover.toFixed(1)}x**.`;
    }
  );
  if (inventory) return inventory;

  const labor = tryMatch(
    [/staff|schedule|overstaff|understaff|overtime|shift/i],
    "labor",
    () =>
      `Labor **${fmtPct(a.labor.laborPct)}** · ${a.labor.actualHours.toFixed(0)} actual / ${a.labor.scheduledHours.toFixed(0)} scheduled hrs · OT ${a.labor.overtimeHours.toFixed(1)} hrs. Status: **${a.labor.highlights?.staffingStatus ?? "review"}**.`
  );
  if (labor) return labor;

  const menu = tryMatch(
    [/menu|promote|reprice|remove|margin|special|upsell/i],
    "menuEngineering",
    () => {
      const h = a.menuEngineering.highlights;
      return [
        h?.promoteItems?.length
          ? `Promote: ${h.promoteItems.slice(0, 3).map((i) => i.name).join(", ")}`
          : "",
        h?.repriceItems?.length
          ? `Reprice: ${h.repriceItems.slice(0, 3).map((i) => i.name).join(", ")}`
          : "",
        h?.removeItems?.length
          ? `Remove: ${h.removeItems.slice(0, 3).map((i) => i.name).join(", ")}`
          : "",
      ]
        .filter(Boolean)
        .join("\n");
    }
  );
  if (menu) return menu;

  const forecast = tryMatch(
    [/forecast|tomorrow|weekend|busy|weather|event|holiday/i],
    "forecasting",
    () => {
      const f = a.forecasting.salesForecast7d?.[0];
      return f
        ? `Next forecast (${f.date}): projected **${fmtMoney(f.predicted)}** sales.`
        : "Add more historical orders to improve forecasts.";
    }
  );
  if (forecast) return forecast;

  const purchasing = tryMatch(
    [
      /purchase order|draft po|auto.?order|smart po|approve.*po|transmit/i,
      /which vendor|best price|bid|bidding|cheapest vendor|compare.*vendor/i,
      /sysco|us foods|gordon|edi|broadline/i,
      /order from today|order list|what should i order/i,
    ],
    "purchasing",
    () => {
      const p = a.purchasing;
      const h = p.highlights;
      const lines = ["## Automated Purchasing & Bidding", ""];

      if (h.smartOrdering?.draftPoCount) {
        lines.push(
          `**Draft POs:** ${h.smartOrdering.draftPoCount} smart draft(s) across ${h.smartOrdering.autoBuiltVendors} vendor(s) — **${fmtMoney(h.smartOrdering.draftPoTotal)}** awaiting your approval in Purchase Orders.`
        );
        for (const d of (p.draftPurchaseOrders ?? []).slice(0, 4)) {
          lines.push(`- ${d.vendor}: ${d.lineCount} lines · ${fmtMoney(d.totalAmount)}`);
        }
      } else {
        lines.push(
          "**Draft POs:** None yet — open **Purchase Orders → Smart POs** and click *Build draft POs by vendor* to auto-generate from par levels and forecasts."
        );
      }

      lines.push("");
      const bid = h.vendorBidding;
      if (bid?.multiVendorItems) {
        lines.push(
          `**Cross-vendor bidding:** ${bid.multiVendorItems} items compared — est. weekly savings **${fmtMoney(bid.estimatedWeeklySavings)}**.`
        );
        if (bid.topOpportunity) {
          lines.push(
            `Best opportunity: **${bid.topOpportunity.itemName}** → order from **${bid.topOpportunity.vendor}** (${bid.topOpportunity.savingsPct.toFixed(0)}% vs current).`
          );
        }
        for (const b of (p.vendorBids ?? []).slice(0, 4)) {
          const alt = b.vendors
            .map((v) => `${v.vendor} $${v.unitPrice.toFixed(2)}`)
            .join(" · ");
          lines.push(`- **${b.itemName}:** ${alt} → **${b.recommendedVendor}**`);
        }
      } else {
        lines.push(
          "**Bidding:** Add vendor price quotes (or connect EDI catalogs) to enable automatic cross-vendor comparison."
        );
      }

      lines.push("");
      if (h.ediCatalogs?.length) {
        lines.push("**EDI catalogs:**");
        for (const e of h.ediCatalogs) {
          lines.push(
            `- ${e.name}: ${e.connected ? `connected · ${e.catalogItems} SKUs` : "not connected"}`
          );
        }
      }

      const twm = h.threeWayMatch;
      if (twm) {
        lines.push("", "**Three-way match (invoice protection):**");
        if (twm.discrepancyCount > 0) {
          lines.push(
            `**${twm.discrepancyCount} invoice(s) on HOLD** — $${twm.holdPaymentTotal.toFixed(0)} at risk if paid without resolving.`
          );
          for (const issue of twm.openIssues.slice(0, 3)) {
            lines.push(`- ${issue.vendor}: ${issue.issue}`);
          }
          lines.push("_Compare PO vs receiving log vs invoice before paying._");
        } else if (twm.matchedCount > 0) {
          lines.push(`${twm.matchedCount} invoice(s) passed — PO, receipt, and invoice align.`);
        } else {
          lines.push("Scan invoices against POs and receiving logs in Purchase Orders → Three-Way Match.");
        }
      }

      const dig = h.invoiceDigitization;
      if (dig) {
        lines.push("", "**Invoice digitization & price auditing:**");
        lines.push(`${dig.ocrInvoicesThisMonth} invoice(s) digitized this month via OCR.`);
        if (dig.recentPriceSpikes > 0) {
          const spike = dig.topSpike;
          lines.push(
            `**${dig.recentPriceSpikes} price spike alert(s)**${spike ? ` — latest: **${spike.item}** +${spike.changePct.toFixed(0)}%` : ""}. Recipe costs recalculated automatically.`
          );
        }
        if (dig.catchWeightAlerts > 0) {
          lines.push(`**${dig.catchWeightAlerts} catch-weight issue(s)** — billed vs received weight mismatch.`);
          for (const c of dig.openCatchWeightIssues.slice(0, 2)) {
            lines.push(`- ${c.item}: ${c.description}`);
          }
        }
        if (!dig.recentPriceSpikes && !dig.catchWeightAlerts) {
          lines.push("Scan paper invoices in Purchase Orders — OCR updates inventory and audits vendor pricing.");
        }
      }

      const cm = h.creditMemoTracking;
      if (cm) {
        lines.push("", "**Credit memo tracking:**");
        if (cm.openCount > 0) {
          lines.push(
            `**${cm.openCount} open credit(s)** — **${fmtMoney(cm.openTotal)}** owed by vendors. ${cm.accountingLockedCount} invoice(s) locked from accounting sync (${fmtMoney(cm.lockedInvoiceExposure)} exposure).`
          );
          for (const c of cm.recentOpen.slice(0, 3)) {
            lines.push(`- ${c.vendor}: ${fmtMoney(c.amount)} — ${c.reason}`);
          }
        } else {
          lines.push("Snap damaged goods in Purchase Orders → Credits to email vendor rep and lock AP sync.");
        }
      }

      const sc = h.vendorScorecards;
      if (sc && sc.vendorCount > 0) {
        lines.push("", "**Vendor scorecards (90-day reliability):**");
        lines.push(
          `Avg fill ${sc.avgFillRate}% · on-time ${sc.avgOnTime}% · substitution ${sc.avgSubstitutionRate}%`
        );
        if (sc.bestVendor) {
          lines.push(`Best: **${sc.bestVendor.vendor}** (grade ${sc.bestVendor.reliabilityGrade})`);
        }
        if (sc.worstVendor) {
          lines.push(
            `Needs review: **${sc.worstVendor.vendor}** — fill ${sc.worstVendor.fillRatePct}%, on-time ${sc.worstVendor.onTimePct}%, substitutions ${sc.worstVendor.substitutionRatePct}%`
          );
        }
        for (const v of sc.topVendors.slice(0, 4)) {
          lines.push(
            `- ${v.vendor}: grade ${v.reliabilityGrade} (${v.reliabilityScore}) — fill ${v.fillRatePct}%, on-time ${v.onTimePct}%`
          );
        }
      }

      const comp = p.vendorBids?.length
        ? null
        : (a.foodCost as { vendorComparison?: Array<{ itemName: string; cheapestVendor: string; potentialSavingsPct: number }> })
            .vendorComparison;
      if (comp?.length) {
        lines.push("", "**Price comparison (inventory):**");
        for (const c of comp.slice(0, 3)) {
          lines.push(
            `- ${c.itemName}: switch to **${c.cheapestVendor}** (${c.potentialSavingsPct.toFixed(0)}% savings potential)`
          );
        }
      }

      lines.push(
        "",
        "**Next steps:** Review drafts → Approve & transmit (email or EDI) → receive and match invoices."
      );
      return lines.join("\n");
    }
  );
  if (purchasing) return purchasing;

  const threeWay = tryMatch(
    [/three.?way|short.?ship|overbill|hold payment|invoice.*match|match.*invoice|charged for.*not received|did we receive everything/i],
    "purchasing",
    () => {
      const twm = a.purchasing.highlights?.threeWayMatch;
      const lines = ["## Three-Way Match (Invoice Protection)", ""];
      lines.push(
        "Pinnacle compares **PO (ordered)** · **Receiving log (truck)** · **Invoice (billed)** on every vendor bill."
      );
      if (!twm || twm.discrepancyCount === 0 && twm.matchedCount === 0) {
        lines.push("", "No matched invoices yet. Flow: receive PO → scan invoice → automatic match runs.");
        return lines.join("\n");
      }
      if (twm.discrepancyCount > 0) {
        lines.push(
          "",
          `**Hold payment on ${twm.discrepancyCount} invoice(s)** — **${fmtMoney(twm.holdPaymentTotal)}** exposure if paid as-is.`
        );
        for (const issue of twm.openIssues) {
          lines.push(`- **${issue.vendor}:** ${issue.issue} (${fmtMoney(issue.exposure)} at risk)`);
        }
        lines.push("", "**Action:** Resolve with vendor credit or adjusted invoice before paying.");
      }
      if (twm.matchedCount > 0) {
        lines.push("", `**${twm.matchedCount} invoice(s) cleared** — safe to pay.`);
      }
      return lines.join("\n");
    }
  );
  if (threeWay) return threeWay;

  const invoiceDigitization = tryMatch(
    [
      /ocr|scan.*invoice|digitiz|photo.*invoice|crumpled|paper invoice/i,
      /price spike|sneaky.*price|vendor.*raised|oil.*price|cooking oil/i,
      /catch.?weight|heavy box|billed.*weight|received.*weight|brisket.*weight|paying for.*box/i,
      /recipe cost.*invoice|invoice.*recipe/i,
    ],
    "purchasing",
    () => {
      const dig = a.purchasing.highlights?.invoiceDigitization;
      const lines = ["## Invoice Digitization & Price Auditing", ""];
      lines.push(
        "Snap a messy vendor invoice — **OCR** reads every line item, updates inventory quantities, logs the expense, and runs three-way match."
      );
      lines.push(
        "**Price spikes:** When a vendor quietly raises an item (e.g. cooking oil +15%), management gets a **push notification** and **recipe costs recalculate** automatically."
      );
      lines.push(
        "**Catch-weight:** For case items billed by weight (brisket, fish), Pinnacle compares **billed lbs vs received lbs** so you are not paying for heavy boxes."
      );
      if (dig) {
        lines.push("", `**This month:** ${dig.ocrInvoicesThisMonth} invoice(s) digitized.`);
        if (dig.recentPriceSpikes > 0 && dig.topSpike) {
          lines.push(
            `**Active price spike:** ${dig.topSpike.item} +${dig.topSpike.changePct.toFixed(0)}% — review menu pricing.`
          );
        }
        if (dig.catchWeightAlerts > 0) {
          lines.push(`**Catch-weight alerts:** ${dig.catchWeightAlerts} open issue(s).`);
          for (const c of dig.openCatchWeightIssues.slice(0, 3)) {
            lines.push(`- ${c.item}: ${c.description}`);
          }
        }
      }
      lines.push("", "**Action:** Purchase Orders → Three-Way Match → **Scan invoice**.");
      return lines.join("\n");
    }
  );
  if (invoiceDigitization) return invoiceDigitization;

  const creditMemo = tryMatch(
    [
      /credit memo|vendor credit|credit request|damaged goods|rotten produce|shattered|missing credit/i,
      /bookkeeper.*pay|accounting.*lock|sync.*lock|pay full invoice/i,
      /vendor owe|owed by vendor|open credit/i,
    ],
    "purchasing",
    () => {
      const cm = a.purchasing.highlights?.creditMemoTracking;
      const lines = ["## Credit Memo Tracking", ""];
      lines.push(
        "Staff snap damaged or spoiled goods — Pinnacle **generates a credit request**, **emails the vendor rep**, and **locks accounting sync** on the linked invoice so your bookkeeper cannot pay the full bill until the credit memo is applied."
      );
      if (cm && cm.openCount > 0) {
        lines.push(
          "",
          `**${cm.openCount} open credit(s)** — **${fmtMoney(cm.openTotal)}** pending from vendors.`
        );
        if (cm.accountingLockedCount > 0) {
          lines.push(
            `**${cm.accountingLockedCount} invoice(s) locked** from QuickBooks/Xero sync — **${fmtMoney(cm.lockedInvoiceExposure)}** held until credits clear.`
          );
        }
        for (const c of cm.recentOpen.slice(0, 4)) {
          lines.push(`- **${c.vendor}** ${fmtMoney(c.amount)}: ${c.reason}${c.emailStatus ? ` (email ${c.emailStatus})` : ""}`);
        }
        lines.push("", "**Action:** Mark memo received in Purchase Orders → Credits when vendor applies credit.");
      } else {
        lines.push("", "No open credits. Use **Purchase Orders → Credits → Snap damage & request credit**.");
      }
      return lines.join("\n");
    }
  );
  if (creditMemo) return creditMemo;

  const vendorScorecards = tryMatch(
    [
      /vendor scorecard|fill rate|on.?time.*deliver|deliver.*on time|lunch rush/i,
      /substitut|swap.*brand|cheaper alternative|premium.*brand|silent swap/i,
      /vendor reliab|which vendor.*reliable|contract negotiat|vendor.*late/i,
      /short.?ship|deliver everything|missing from.*order/i,
    ],
    "purchasing",
    () => {
      const sc = a.purchasing.highlights?.vendorScorecards;
      const lines = ["## Vendor Scorecards", ""];
      lines.push(
        "Pinnacle tracks **fill rate** (everything ordered actually delivered), **on-time %** (vs expected window — e.g. 9 AM not lunch rush), and **substitution frequency** (premium brands swapped without asking)."
      );
      if (!sc || sc.vendorCount === 0) {
        lines.push("", "Build history by receiving POs in **Purchase Orders → Scorecards**.");
        return lines.join("\n");
      }
      lines.push(
        "",
        `**${sc.vendorCount} vendor(s) scored** — network avg: ${sc.avgFillRate}% fill, ${sc.avgOnTime}% on-time, ${sc.avgSubstitutionRate}% substitutions.`
      );
      if (sc.worstVendor) {
        lines.push(
          `**Negotiation leverage — ${sc.worstVendor.vendor}:** grade **${sc.worstVendor.reliabilityGrade}** — fill ${sc.worstVendor.fillRatePct}%, on-time ${sc.worstVendor.onTimePct}%, substitutions ${sc.worstVendor.substitutionRatePct}%.`
        );
      }
      if (sc.bestVendor) {
        lines.push(`**Most reliable:** ${sc.bestVendor.vendor} (grade ${sc.bestVendor.reliabilityGrade}).`);
      }
      for (const v of sc.topVendors.slice(0, 5)) {
        lines.push(
          `- **${v.vendor}** — ${v.reliabilityGrade} (${v.reliabilityScore}/100): fill ${v.fillRatePct}% · on-time ${v.onTimePct}% · subs ${v.substitutionRatePct}%`
        );
      }
      lines.push("", "Full scorecards: **Purchase Orders → Scorecards** tab.");
      return lines.join("\n");
    }
  );
  if (vendorScorecards) return vendorScorecards;

  const kq = pickKeyQuestions(a, category.sections);
  if (kq.length) {
    return {
      question,
      answer: `Based on your data:\n\n${kq.map((k) => `- ${k}`).join("\n")}\n\n_Ask a more specific question for a deeper answer._`,
      categoryId: category.id,
      categoryLabel: category.label,
      confidence: "medium",
      sources: category.sections,
      relatedActions: kq.slice(0, 3),
      usedAI: false,
    };
  }

  return null;
}

async function answerWithGPT(
  question: string,
  category: { id: string; label: string; sections: string[] },
  snapshot: Awaited<ReturnType<typeof buildCommandCenterSnapshot>>
): Promise<ManagerAnswer> {
  const focused: Record<string, unknown> = {
    question,
    category: category.label,
    commandCenter: {
      sales: snapshot.sales,
      labor: snapshot.labor,
      foodCost: snapshot.foodCost,
      inventory: snapshot.inventory,
      scheduling: snapshot.scheduling,
      vendors: snapshot.vendors,
      waste: snapshot.waste,
      reviews: snapshot.reviews,
      employees: snapshot.employees,
      operations: snapshot.operations,
      profitability: snapshot.profitability,
      alerts: snapshot.alerts,
    },
    analytics: snapshot.analytics,
  };

  try {
    const response = await openai!.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are the AI brain of a restaurant command center. The owner asks plain-English questions and you answer by synthesizing ALL connected data: sales, labor, inventory, scheduling, vendor invoices, **three-way match (PO vs receiving log vs invoice)** with hold-payment recommendations, waste logs, guest reviews, employee performance, operations (voids/discounts), menu engineering, profitability, and automated purchasing — together, not in silos.

Rules:
- Lead with a one-sentence headline answering the question directly
- Cite specific numbers, names, and dollar amounts from the data
- Connect causes across domains (e.g. labor + waste + reviews affecting profit)
- End with 2-4 prioritized actions
- Use markdown. If data is missing, say what you have and what to track
- For creative tasks (checklists, review responses), ground in their real menu/metrics`,
        },
        { role: "user", content: JSON.stringify(focused) },
      ],
      max_tokens: 1000,
    });

    const answer = response.choices[0]?.message?.content?.trim();
    if (answer) {
      const headline = answer.split("\n").find((l) => l.trim())?.replace(/^#+\s*/, "") ?? "";
      return enrichWithCommandCenter(
        {
          question,
          answer,
          headline,
          categoryId: category.id,
          categoryLabel: category.label,
          confidence: "high",
          sources: Object.keys(DOMAIN_LABELS),
          relatedActions: [],
          usedAI: true,
        },
        snapshot
      );
    }
  } catch (err) {
    console.error("Manager AI answer error:", err);
  }

  return enrichWithCommandCenter(
    {
      question,
      answer:
        "I couldn't reach the AI engine. Your live command center data is loaded — try a quick command like \"What's hurting my profit this week?\"",
      categoryId: category.id,
      categoryLabel: category.label,
      confidence: "low",
      sources: [],
      relatedActions: ["Load sample data on Analytics", "Set OPENAI_API_KEY for deeper answers"],
      usedAI: false,
    },
    snapshot
  );
}

export async function answerManagerQuestion(
  question: string,
  locationId?: string
): Promise<ManagerAnswer> {
  const trimmed = question.trim();
  if (!trimmed) {
    return {
      question: trimmed,
      answer: "Please enter a question.",
      categoryId: "ai_commands",
      categoryLabel: "Command Center",
      confidence: "low",
      sources: [],
      relatedActions: [],
      usedAI: false,
    };
  }

  const locId = locationId || (await getLocationId());
  const snapshot = await buildCommandCenterSnapshot(locId);
  const ctx = ctxFromSnapshot(snapshot);
  const category = matchPromptCategory(trimmed) ?? {
    id: "ai_commands",
    label: "Command Center",
    sections: ["executive", "sales", "profitability"],
    prompts: [],
  };

  let intent = detectCommandIntent(trimmed);
  const dashId = resolveDashboardCommand(trimmed);
  if (dashId === "improve_profit") intent = "profit_improve";
  if (dashId === "find_problems") intent = "problems";
  if (dashId === "daily_briefing" || dashId === "owner_report") intent = "briefing";

  if (intent !== "general") {
    return asCommandCenterAnswer(runCommandCenterAnalysis(snapshot, trimmed, intent));
  }

  if (dashId) {
    const dashAnswer = answerDashboardCommand(dashId, ctx);
    if (dashAnswer) {
      return enrichWithCommandCenter(
        { ...dashAnswer, headline: dashAnswer.answer.split("\n")[0]?.replace(/^#+\s*/, "") },
        snapshot
      );
    }
  }

  const ruleAnswer = answerFromKeyQuestions(trimmed, category, ctx);
  const isCreative = /checklist|quiz|write|create|email|apology|post|calendar|report|guide/i.test(trimmed);

  if (openai && (isCreative || !ruleAnswer)) {
    return answerWithGPT(trimmed, category, snapshot);
  }

  if (ruleAnswer && ruleAnswer.confidence !== "low") {
    return enrichWithCommandCenter(ruleAnswer, snapshot);
  }

  if (ruleAnswer) return enrichWithCommandCenter(ruleAnswer, snapshot);

  return asCommandCenterAnswer(runCommandCenterAnalysis(snapshot, trimmed, "profit_hurt"));
}
