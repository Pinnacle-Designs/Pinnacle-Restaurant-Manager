import OpenAI from "openai";
import { computeAnalytics } from "./compute";
import type { AnalyticsInsight, AnalyticsPayload } from "./types";

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

export const ANALYTICS_SECTIONS = [
  "executive",
  "sales",
  "food",
  "labor",
  "menu",
  "marketing",
  "customer",
  "operations",
  "purchasing",
  "forecasting",
  "profitability",
  "external",
] as const;

export type AnalyticsSection = (typeof ANALYTICS_SECTIONS)[number];

const SECTION_LABELS: Record<AnalyticsSection, string> = {
  executive: "Executive Summary",
  sales: "Sales",
  food: "Food & Inventory",
  labor: "Labor",
  menu: "Menu Engineering",
  marketing: "Marketing",
  customer: "Guest Experience",
  operations: "Operations",
  purchasing: "Purchasing",
  forecasting: "Forecasting",
  profitability: "Profitability",
  external: "External Factors",
};

function sectionPayload(payload: AnalyticsPayload, section: AnalyticsSection) {
  const base = { periodDays: payload.periodDays, section, label: SECTION_LABELS[section] };
  switch (section) {
    case "executive":
      return { ...base, data: payload.executive, alerts: payload.executive.alerts };
    case "sales":
      return { ...base, data: payload.sales, questions: payload.sales.questions };
    case "food":
      return { ...base, data: payload.foodCost, questions: payload.foodCost.questions };
    case "labor":
      return { ...base, data: payload.labor, questions: payload.labor.questions };
    case "menu":
      return { ...base, data: payload.menuEngineering, questions: payload.menuEngineering.questions };
    case "marketing":
      return { ...base, data: payload.marketing, questions: payload.marketing.questions };
    case "customer":
      return { ...base, data: payload.customerExperience, questions: payload.customerExperience.questions };
    case "operations":
      return { ...base, data: payload.operations, questions: payload.operations.questions };
    case "purchasing":
      return { ...base, data: payload.purchasing, questions: payload.purchasing.questions };
    case "forecasting":
      return { ...base, data: payload.forecasting, questions: payload.forecasting.questions };
    case "profitability":
      return { ...base, data: payload.profitability, questions: payload.profitability.questions };
    case "external":
      return { ...base, data: payload.externalFactors, questions: payload.externalFactors.questions };
  }
}

function formatHour(hour: number) {
  const suffix = hour >= 12 ? "PM" : "AM";
  const h = hour % 12 === 0 ? 12 : hour % 12;
  return `${h}:00 ${suffix}`;
}

function ruleBasedSectionInsights(
  payload: AnalyticsPayload,
  section: AnalyticsSection
): AnalyticsInsight[] {
  const insights: AnalyticsInsight[] = [];

  switch (section) {
    case "executive": {
      const y = payload.executive.yesterday;
      insights.push({
        title: "Yesterday performance",
        description: `Net sales $${y.netSales.toFixed(0)} with prime cost at ${y.primeCostPct.toFixed(1)}% (food ${y.foodCostPct.toFixed(1)}% + labor ${y.laborPct.toFixed(1)}%). Estimated profit $${y.profitEstimate.toFixed(0)} from ${y.guestCount} guests.`,
        severity: y.primeCostPct > 65 ? "HIGH" : "LOW",
        category: "EXECUTIVE",
      });
      for (const alert of payload.executive.alerts.slice(0, 3)) {
        insights.push({
          title: alert.message,
          description: `Executive alert: ${alert.type} requires attention.`,
          severity: alert.severity as AnalyticsInsight["severity"],
          category: "EXECUTIVE",
        });
      }
      break;
    }
    case "sales": {
      const s = payload.sales;
      if (s.highlights.topSellingItem) {
        const item = s.highlights.topSellingItem;
        insights.push({
          title: `What sells: ${item.name}`,
          description: `${item.name} leads with $${item.sales.toFixed(0)} (${item.quantity} units). Net sales $${s.netSales.toFixed(0)} across ${s.guestCount} guests.`,
          severity: "LOW",
          category: "SALES",
        });
      }
      if (s.highlights.busiestDaypart && s.highlights.busiestHour) {
        insights.push({
          title: "When we are busiest",
          description: `Peak daypart is ${s.highlights.busiestDaypart.daypart} (${s.highlights.busiestDaypart.orders} orders). Busiest hour is ${formatHour(s.highlights.busiestHour.hour)} with ${s.highlights.busiestHour.orders} orders.`,
          severity: "MEDIUM",
          category: "SALES",
        });
      }
      if (s.highlights.mostProfitableChannel) {
        const ch = s.highlights.mostProfitableChannel;
        insights.push({
          title: `Most profitable channel: ${ch.channel}`,
          description: `${ch.channel} earns $${ch.profit.toFixed(0)} at ${ch.marginPct.toFixed(1)}% margin. Avg check $${s.averageCheck.toFixed(2)}, rev/seat $${s.revenuePerSeat.toFixed(0)}, rev/labor hr $${s.revenuePerLaborHour.toFixed(0)}.`,
          severity: "MEDIUM",
          category: "SALES",
        });
      }
      break;
    }
    case "food": {
      const f = payload.foodCost;
      const pd = f.highlights.productDisappearing;
      insights.push({
        title: "Where is product disappearing?",
        description: `Primary loss: ${pd.primaryCause}. Waste $${pd.wasteCost.toFixed(0)}, spoilage $${pd.spoilageCost.toFixed(0)}, variance gap ${pd.varianceGapPct.toFixed(1)}%.`,
        severity: pd.wasteCost + pd.spoilageCost > 100 || Math.abs(pd.varianceGapPct) > 3 ? "HIGH" : "MEDIUM",
        category: "INVENTORY",
      });

      const drivers = f.highlights.costIncreaseDrivers;
      insights.push({
        title: "Which items are driving food cost increases?",
        description:
          drivers.length > 0
            ? drivers
                .map((d) => `${d.name} (+${d.changePct.toFixed(1)}% vendor pricing, $${d.cost.toFixed(0)} inventory value)`)
                .join("; ")
            : "No significant vendor price increases detected — monitor top cost drivers and portion drift.",
        severity: drivers.some((d) => d.changePct > 7) ? "HIGH" : drivers.length > 0 ? "MEDIUM" : "LOW",
        category: "FINANCE",
      });

      const rc = f.highlights.recipeCompliance;
      insights.push({
        title: "Are recipes being followed?",
        description:
          rc.status === "on_track"
            ? `On track — theoretical ${rc.theoreticalPct.toFixed(1)}% vs actual ${rc.actualPct.toFixed(1)}% (${rc.variancePct.toFixed(1)}% variance).`
            : rc.status === "drift"
              ? `Drift detected — actual ${rc.actualPct.toFixed(1)}% exceeds theoretical ${rc.theoreticalPct.toFixed(1)}% by ${Math.abs(rc.variancePct).toFixed(1)}%.${rc.topDriftItem ? ` Review ${rc.topDriftItem} portions and yields.` : ""}`
              : `Favorable — actual ${rc.actualPct.toFixed(1)}% is below theoretical ${rc.theoreticalPct.toFixed(1)}% by ${Math.abs(rc.variancePct).toFixed(1)}%.`,
        severity: rc.status === "drift" ? "HIGH" : "MEDIUM",
        category: "MENU",
      });

      insights.push({
        title: `Food cost at ${f.foodCostPct.toFixed(1)}%`,
        description: `Actual $${f.actualFoodCost.toFixed(0)} vs theoretical $${f.theoreticalFoodCost.toFixed(0)} (${f.theoreticalFoodCostPct.toFixed(1)}%). Turnover ${f.inventoryTurnover.toFixed(2)}x, ${f.daysOnHand.toFixed(0)} days on hand.`,
        severity: f.foodCostPct > 32 ? "HIGH" : "MEDIUM",
        category: "INVENTORY",
      });
      if (f.highlights.cheaperVendorOpportunity) {
        const opp = f.highlights.cheaperVendorOpportunity;
        insights.push({
          title: `Cheaper vendor: ${opp.itemName}`,
          description: `Switch from ${opp.currentVendor} to ${opp.alternativeVendor} for ~${opp.savingsPct.toFixed(1)}% savings on ${opp.itemName}.`,
          severity: opp.savingsPct > 10 ? "HIGH" : "MEDIUM",
          category: "FINANCE",
        });
      }
      if (f.highlights.vendorWithHighestIncrease && f.highlights.vendorWithHighestIncrease.changePct > 3) {
        const v = f.highlights.vendorWithHighestIncrease;
        insights.push({
          title: `Price increase: ${v.vendor}`,
          description: `${v.vendor} prices up ${v.changePct.toFixed(1)}%. Review menu pricing or negotiate volume discounts.`,
          severity: v.changePct > 7 ? "HIGH" : "MEDIUM",
          category: "FINANCE",
        });
      }
      const highRecipe = f.recipeCosts.find((r) => r.recipeCostPct > 35);
      if (highRecipe) {
        insights.push({
          title: `High recipe cost: ${highRecipe.name}`,
          description: `${highRecipe.name} runs ${highRecipe.recipeCostPct.toFixed(0)}% food cost ($${highRecipe.recipeCost.toFixed(2)} per plate). Verify portions and yields.`,
          severity: "MEDIUM",
          category: "MENU",
        });
      }
      if (f.lowStockItems.length > 0) {
        insights.push({
          title: `${f.lowStockItems.length} low-stock items`,
          description: `Reorder: ${f.lowStockItems.map((i) => i.name).join(", ")}.`,
          severity: f.lowStockItems.length > 3 ? "HIGH" : "MEDIUM",
          category: "INVENTORY",
        });
      }
      break;
    }
    case "labor": {
      const l = payload.labor;
      const h = l.highlights;

      insights.push({
        title: "Are we overstaffed or understaffed?",
        description: `${h.staffingStatus === "overstaffed" ? "Overstaffed" : h.staffingStatus === "understaffed" ? "Understaffed" : "Balanced"} — ${h.staffingReason} Labor ${l.laborPct.toFixed(1)}%, ${l.salesPerLaborHour.toFixed(0)} sales/labor hr.`,
        severity:
          h.staffingStatus === "overstaffed" || h.staffingStatus === "understaffed" ? "HIGH" : "MEDIUM",
        category: "STAFFING",
      });

      insights.push({
        title: "Which shifts are inefficient?",
        description:
          h.inefficientShifts.length > 0
            ? h.inefficientShifts
                .map(
                  (s) =>
                    `${s.label} ($${s.salesPerLaborHour.toFixed(0)}/labor hr, ${s.laborPct.toFixed(1)}% labor)`
                )
                .join("; ")
            : "All shifts are within efficiency targets.",
        severity: h.inefficientShifts.some((s) => s.laborPct > 35) ? "HIGH" : "MEDIUM",
        category: "STAFFING",
      });

      insights.push({
        title: "Which employees produce the best results?",
        description:
          h.topPerformers.length > 0
            ? h.topPerformers
                .slice(0, 3)
                .map(
                  (e) =>
                    `${e.name} (${e.role}): $${e.salesPerLaborHour.toFixed(0)}/hr, ${e.guestsPerLaborHour.toFixed(1)} guests/hr`
                )
                .join("; ")
            : "Add shift schedules to rank employee productivity.",
        severity: "LOW",
        category: "STAFFING",
      });

      insights.push({
        title: `Labor at ${l.laborPct.toFixed(1)}% of sales`,
        description: `$${l.laborCost.toFixed(0)} labor cost · ${l.scheduledHours.toFixed(0)} scheduled / ${l.actualHours.toFixed(0)} actual hrs · variance ${l.laborVarianceHours.toFixed(1)} hrs (${l.laborVariancePct.toFixed(1)}%) · OT ${l.overtimePct.toFixed(1)}%.`,
        severity: l.laborPct > 32 ? "HIGH" : "MEDIUM",
        category: "STAFFING",
      });
      break;
    }
    case "menu": {
      const m = payload.menuEngineering;
      const h = m.highlights;

      insights.push({
        title: "What should we promote?",
        description:
          h.promoteItems.length > 0
            ? h.promoteItems
                .slice(0, 4)
                .map(
                  (i) =>
                    `${i.name} (${i.quadrant.toUpperCase()}, ${i.marginPct.toFixed(0)}% margin, ${i.popularityPct.toFixed(1)}% mix)`
                )
                .join("; ")
            : "No clear promotion candidates — build sales data first.",
        severity: "LOW",
        category: "MENU",
      });

      insights.push({
        title: "What should we reprice?",
        description:
          h.repriceItems.length > 0
            ? h.repriceItems
                .slice(0, 4)
                .map(
                  (i) =>
                    `${i.name} at $${i.price.toFixed(2)} (${i.marginPct.toFixed(0)}% margin, ${i.quantitySold} sold)`
                )
                .join("; ")
            : "No plowhorses detected — popular items have healthy margins.",
        severity: h.repriceItems.length > 0 ? "MEDIUM" : "LOW",
        category: "MENU",
      });

      insights.push({
        title: "What should we remove?",
        description:
          h.removeItems.length > 0
            ? h.removeItems
                .slice(0, 4)
                .map(
                  (i) =>
                    `${i.name} (${i.marginPct.toFixed(0)}% margin, ${i.quantitySold} sold, $${i.contribution.toFixed(0)} contribution)`
                )
                .join("; ")
            : "No dogs on the menu — all items contribute meaningfully.",
        severity: h.removeItems.length > 2 ? "MEDIUM" : "LOW",
        category: "MENU",
      });

      insights.push({
        title: "Menu engineering matrix",
        description: `${m.stars} stars, ${m.plowhorses} plowhorses, ${m.puzzles} puzzles, ${m.dogs} dogs. ${m.totalItemsSold} items sold, $${m.totalContribution.toFixed(0)} total contribution.${h.topContributor ? ` Top: ${h.topContributor.name} ($${h.topContributor.contribution.toFixed(0)}).` : ""}`,
        severity: m.dogs > 2 ? "MEDIUM" : "LOW",
        category: "MENU",
      });
      break;
    }
    case "marketing": {
      const mk = payload.marketing;
      const h = mk.highlights;

      insights.push({
        title: "Is marketing actually generating sales?",
        description: h.salesGenerating.reason,
        severity: h.salesGenerating.status === "yes" ? "LOW" : h.salesGenerating.status === "weak" ? "MEDIUM" : "HIGH",
        category: "GENERAL",
      });

      insights.push({
        title: "Which channels bring profitable customers?",
        description:
          h.profitableChannels.length > 0
            ? h.profitableChannels
                .slice(0, 4)
                .map(
                  (c) =>
                    `${c.channel}: $${c.profit.toFixed(0)} profit (${c.marginPct.toFixed(1)}% margin, ${c.orders} orders${c.marketingSpend > 0 ? `, ${c.roas.toFixed(1)}x ROAS` : ""})`
                )
                .join("; ")
            : "No channel profitability data — add orders with channel tags.",
        severity: "MEDIUM",
        category: "GENERAL",
      });

      insights.push({
        title: `Marketing spend $${mk.totalSpend.toFixed(0)}`,
        description: `CAC $${mk.customerAcquisitionCost.toFixed(0)}, ROAS ${mk.returnOnAdSpend.toFixed(1)}x, LTV est. $${mk.lifetimeValueEstimate.toFixed(0)}, repeat rate ${mk.repeatVisitRate.toFixed(0)}%. ${mk.newGuests} new / ${mk.returningGuests} returning guests.`,
        severity: mk.returnOnAdSpend < 2 && mk.totalSpend > 0 ? "MEDIUM" : "LOW",
        category: "GENERAL",
      });

      const topCampaign = [...mk.campaigns].sort((a, b) => b.roas - a.roas)[0];
      if (topCampaign) {
        insights.push({
          title: `Best campaign: ${topCampaign.name}`,
          description: `${topCampaign.channel} at ${topCampaign.roas.toFixed(1)}x ROAS — $${topCampaign.spend.toFixed(0)} spend → $${topCampaign.revenue.toFixed(0)} attributed.`,
          severity: topCampaign.roas < 2 ? "MEDIUM" : "LOW",
          category: "GENERAL",
        });
      }
      break;
    }
    case "customer": {
      const cx = payload.customerExperience;
      const h = cx.highlights;

      insights.push({
        title: "What is hurting guest satisfaction?",
        description:
          h.satisfactionHurts.length > 0
            ? h.satisfactionHurts
                .slice(0, 4)
                .map((s) => `${s.issue} (${s.count} mentions, ${s.avgRating.toFixed(1)}★ avg)`)
                .join("; ")
            : `Overall ${cx.avgRating.toFixed(1)}★ — no dominant complaint category yet.`,
        severity: cx.avgRating < 4 || h.sentimentSummary.overall === "negative" ? "HIGH" : "MEDIUM",
        category: "CUSTOMER",
      });

      insights.push({
        title: "Which locations or shifts create complaints?",
        description:
          h.complaintHotspots.length > 0
            ? h.complaintHotspots
                .map(
                  (s) =>
                    `${s.label} shift: ${s.count} negative reviews${s.topCategory ? ` (${s.topCategory})` : ""}`
                )
                .join("; ")
            : "No daypart complaint pattern detected — monitor by shift as review volume grows.",
        severity: h.complaintHotspots.some((s) => s.count >= 2) ? "HIGH" : "LOW",
        category: "CUSTOMER",
      });

      insights.push({
        title: `Guest rating ${cx.avgRating.toFixed(1)}★`,
        description: `${cx.reviewCount} reviews · ${cx.unresolvedCount} unresolved · sentiment ${h.sentimentSummary.overall} (${h.sentimentSummary.positive}+ / ${h.sentimentSummary.neutral} neutral / ${h.sentimentSummary.negative}−). Avg resolution ${cx.resolutionTimes.avgDaysToResolve.toFixed(1)} days.`,
        severity: cx.avgRating < 4 ? "HIGH" : cx.unresolvedCount > 0 ? "MEDIUM" : "LOW",
        category: "CUSTOMER",
      });

      if (cx.googleReviews.count > 0) {
        insights.push({
          title: `Google reviews: ${cx.googleReviews.avgRating.toFixed(1)}★`,
          description: `${cx.googleReviews.count} Google reviews, ${cx.googleReviews.unresolved} unresolved.`,
          severity: cx.googleReviews.avgRating < 4 ? "MEDIUM" : "LOW",
          category: "CUSTOMER",
        });
      }
      break;
    }
    case "operations": {
      const o = payload.operations;
      const h = o.highlights;

      insights.push({
        title: "Where are bottlenecks?",
        description:
          h.bottlenecks.length > 0
            ? h.bottlenecks
                .map((b) => `${b.label} (${b.avgTicketMinutes.toFixed(0)} min avg, ${b.orders} orders)`)
                .join("; ")
            : `Peak volume daypart is ${o.bottleneckDaypart} — monitor kitchen capacity.`,
        severity: h.bottlenecks.some((b) => b.avgTicketMinutes > 25) ? "HIGH" : "MEDIUM",
        category: "OPERATIONS",
      });

      insights.push({
        title: "Are long ticket times hurting sales?",
        description: h.ticketTimeImpact.reason,
        severity: h.ticketTimeImpact.status === "hurting" ? "HIGH" : "MEDIUM",
        category: "OPERATIONS",
      });

      insights.push({
        title: `Operations snapshot`,
        description: `Ticket ${o.avgTicketTimeMinutes.toFixed(0)} min · kitchen ~${o.avgKitchenProductionMinutes.toFixed(0)} min · accuracy ${o.orderAccuracyPct.toFixed(1)}% · voids ${o.voidRatePct.toFixed(2)}% · discounts ${o.discountRatePct.toFixed(2)}% · comps ${o.compRatePct.toFixed(2)}%.`,
        severity: o.avgTicketTimeMinutes > 20 ? "HIGH" : "MEDIUM",
        category: "OPERATIONS",
      });

      if (o.voidRatePct > 1) {
        insights.push({
          title: "Void rate above target",
          description: `$${o.voidTotal.toFixed(0)} in voids (${o.voidRatePct.toFixed(2)}%) — audit POS entries and kitchen communication.`,
          severity: "HIGH",
          category: "OPERATIONS",
        });
      }
      break;
    }
    case "purchasing": {
      const p = payload.purchasing;
      const h = p.highlights;
      insights.push({
        title: "Which suppliers are increasing costs?",
        description:
          h.costIncreaseSuppliers.length > 0
            ? h.costIncreaseSuppliers
                .map((s) => `${s.vendor} (+${s.changePct.toFixed(1)}%, $${s.spend.toFixed(0)} spend)`)
                .join("; ")
            : "No supplier price increases detected in this period.",
        severity: h.costIncreaseSuppliers.some((s) => s.changePct > 7) ? "HIGH" : "MEDIUM",
        category: "FINANCE",
      });
      insights.push({
        title: "Are we paying market rates?",
        description: h.marketRateStatus.reason,
        severity: h.marketRateStatus.status === "above" ? "HIGH" : "LOW",
        category: "FINANCE",
      });
      insights.push({
        title: `Purchasing $${p.totalPurchases.toFixed(0)}`,
        description: `${p.vendorCount} vendors, ${p.costInflationPct.toFixed(1)}% avg inflation.`,
        severity: p.costInflationPct > 5 ? "HIGH" : "LOW",
        category: "FINANCE",
      });
      const smart = h.smartOrdering;
      if (smart && smart.draftPoCount > 0) {
        insights.push({
          title: "Smart draft POs ready for review",
          description: `${smart.draftPoCount} draft order(s) across ${smart.autoBuiltVendors} vendor(s) — $${smart.draftPoTotal.toFixed(0)} total. Review and approve in Purchase Orders.`,
          severity: "MEDIUM",
          category: "INVENTORY",
        });
      }
      const bid = h.vendorBidding;
      if (bid && bid.multiVendorItems > 0) {
        insights.push({
          title: "Cross-vendor bidding opportunities",
          description: bid.topOpportunity
            ? `${bid.multiVendorItems} items bid across vendors — best: ${bid.topOpportunity.itemName} from ${bid.topOpportunity.vendor} (${bid.topOpportunity.savingsPct.toFixed(0)}% savings). Est. weekly savings $${bid.estimatedWeeklySavings.toFixed(0)}.`
            : `${bid.multiVendorItems} items compared across vendors.`,
          severity: bid.estimatedWeeklySavings > 50 ? "HIGH" : "MEDIUM",
          category: "INVENTORY",
        });
      }
      const twm = h.threeWayMatch;
      if (twm && twm.discrepancyCount > 0) {
        insights.push({
          title: "Three-way match — hold payment",
          description:
            twm.openIssues.length > 0
              ? `${twm.discrepancyCount} invoice(s) fail PO vs receipt vs invoice check — $${twm.holdPaymentTotal.toFixed(0)} at risk. ${twm.openIssues[0]!.issue}`
              : `${twm.discrepancyCount} invoice discrepancy(ies) — review before paying vendors.`,
          severity: twm.holdPaymentTotal > 100 ? "CRITICAL" : "HIGH",
          category: "FINANCE",
        });
      } else if (twm && twm.matchedCount > 0) {
        insights.push({
          title: "Invoice protection active",
          description: `${twm.matchedCount} invoice(s) passed three-way match (PO, receiving log, invoice aligned).`,
          severity: "LOW",
          category: "FINANCE",
        });
      }
      const dig = h.invoiceDigitization;
      if (dig && dig.recentPriceSpikes > 0) {
        insights.push({
          title: "Vendor price spike detected",
          description: dig.topSpike
            ? `${dig.topSpike.item} up ${dig.topSpike.changePct.toFixed(0)}% — recipe costs recalculated. Push alert sent to management.`
            : `${dig.recentPriceSpikes} ingredient price spike(s) in the last 14 days.`,
          severity: dig.topSpike && dig.topSpike.changePct >= 15 ? "CRITICAL" : "HIGH",
          category: "INVENTORY",
        });
      }
      if (dig && dig.catchWeightAlerts > 0) {
        insights.push({
          title: "Catch-weight billing mismatch",
          description:
            dig.openCatchWeightIssues[0]?.description ??
            `${dig.catchWeightAlerts} case item(s) billed for more weight than received — possible heavy-box overcharge.`,
          severity: "HIGH",
          category: "FINANCE",
        });
      }
      const cm = h.creditMemoTracking;
      if (cm && cm.openCount > 0) {
        insights.push({
          title: "Open vendor credits — AP sync locked",
          description: `${cm.openCount} credit memo(s) pending ($${cm.openTotal.toFixed(0)}). ${cm.accountingLockedCount} invoice(s) blocked from accounting sync until vendor applies credit.`,
          severity: cm.openTotal > 200 ? "HIGH" : "MEDIUM",
          category: "FINANCE",
        });
      }
      const sc = h.vendorScorecards;
      if (sc && sc.worstVendor && sc.worstVendor.reliabilityScore < 75) {
        insights.push({
          title: "Vendor reliability — contract leverage",
          description: `${sc.worstVendor.vendor} scores grade ${sc.worstVendor.reliabilityGrade} — fill ${sc.worstVendor.fillRatePct}%, on-time ${sc.worstVendor.onTimePct}%, substitutions ${sc.worstVendor.substitutionRatePct}%. Review at renewal.`,
          severity: sc.worstVendor.reliabilityScore < 60 ? "HIGH" : "MEDIUM",
          category: "INVENTORY",
        });
      }
      break;
    }
    case "forecasting": {
      const f = payload.forecasting;
      const h = f.highlights;
      insights.push({
        title: "How much staff do I need next Friday?",
        description: `${h.staffNeededNextFriday.hours.toFixed(0)} labor hours projected for ${h.staffNeededNextFriday.date} ($${h.staffNeededNextFriday.predictedSales.toFixed(0)} predicted sales).`,
        severity: "MEDIUM",
        category: "STAFFING",
      });
      insights.push({
        title: "How much of every item should I order tomorrow?",
        description:
          h.inventoryOrderTomorrow.length > 0
            ? h.inventoryOrderTomorrow
                .map((i) => `${i.name}: order ${i.quantity} ${i.unit} (${i.onHand} on hand)`)
                .join("; ")
            : "No inventory items tracked — add SKUs to generate tomorrow's order plan.",
        severity: h.inventoryOrderTomorrow.some((i) => i.quantity > 0 && i.onHand <= 0) ? "HIGH" : "MEDIUM",
        category: "INVENTORY",
      });
      insights.push({
        title: "Catering demand forecast",
        description: `${h.cateringDemandNext7d.orders} catering orders and $${h.cateringDemandNext7d.sales.toFixed(0)} projected over 7 days (trend: ${h.cateringDemandNext7d.trend}).`,
        severity: h.cateringDemandNext7d.trend === "up" ? "MEDIUM" : "LOW",
        category: "OPERATIONS",
      });
      insights.push({
        title: "Seasonal trend",
        description: `${h.seasonalTrend.pattern}: ${h.seasonalTrend.insight} Peak day: ${h.seasonalTrend.peakDay}.`,
        severity: Math.abs(h.seasonalTrend.liftPct) > 15 ? "MEDIUM" : "LOW",
        category: "GENERAL",
      });
      const totalForecast = f.salesForecast7d.reduce((s, d) => s + d.predicted, 0);
      insights.push({
        title: "7-day sales outlook",
        description: `Projected $${totalForecast.toFixed(0)} sales. ${f.seasonalNote}`,
        severity: "LOW",
        category: "GENERAL",
      });
      break;
    }
    case "profitability": {
      const pr = payload.profitability;
      const h = pr.highlights;
      insights.push({
        title: "Where is profit leaking?",
        description:
          h.profitLeaks.length > 0
            ? h.profitLeaks.map((l) => `${l.area}: $${l.amount.toFixed(0)} (${l.reason})`).join("; ")
            : "No major profit leaks detected.",
        severity: h.profitLeaks.length > 2 ? "HIGH" : "LOW",
        category: "FINANCE",
      });
      insights.push({
        title: "Which menu items, hours, days, and channels drive profit?",
        description: [
          h.topProfitItem ? `Item: ${h.topProfitItem.name} ($${h.topProfitItem.profit.toFixed(0)})` : null,
          h.topProfitHour ? `Hour: ${h.topProfitHour.label} ($${h.topProfitHour.profit.toFixed(0)})` : null,
          h.topProfitDay ? `Day: ${h.topProfitDay.date} ($${h.topProfitDay.profit.toFixed(0)})` : null,
          h.topProfitChannel ? `Channel: ${h.topProfitChannel.channel} ($${h.topProfitChannel.profit.toFixed(0)})` : null,
        ]
          .filter(Boolean)
          .join("; ") || "Insufficient order data for profit breakdown.",
        severity: "MEDIUM",
        category: "FINANCE",
      });
      insights.push({
        title: "Which employees, shifts, and campaigns are most profitable?",
        description: [
          h.topProfitEmployee ? `Employee: ${h.topProfitEmployee.name} ($${h.topProfitEmployee.profit.toFixed(0)})` : null,
          h.lowestProfitShift ? `Weakest shift: ${h.lowestProfitShift.shift} ($${h.lowestProfitShift.profit.toFixed(0)})` : null,
          h.topCampaign ? `Campaign: ${h.topCampaign.name} ($${h.topCampaign.profit.toFixed(0)} net)` : null,
          pr.byDeliveryProvider[0] ? `Delivery: ${pr.byDeliveryProvider[0].provider} ($${pr.byDeliveryProvider[0].profit.toFixed(0)})` : null,
        ]
          .filter(Boolean)
          .join("; ") || "Add shifts and campaigns to compare profitability.",
        severity: "MEDIUM",
        category: "FINANCE",
      });
      insights.push({
        title: `Net margin ${pr.profitMarginPct.toFixed(1)}%`,
        description: `Gross $${pr.grossProfit.toFixed(0)}, net est. $${pr.netProfitEstimate.toFixed(0)}. Profit by category, location (${pr.byLocation[0]?.name ?? "n/a"}), and ${pr.byMenuItem.length} menu items tracked.`,
        severity: pr.profitMarginPct < 10 ? "HIGH" : "LOW",
        category: "FINANCE",
      });
      break;
    }
    case "external": {
      const ex = payload.externalFactors;
      const h = ex.highlights;
      insights.push({
        title: "How does weather affect sales and delivery?",
        description: h.weatherImpact
          ? `${h.weatherImpact.insight}${h.weatherImpact.deliveryShiftPct != null ? ` Delivery shift ${h.weatherImpact.deliveryShiftPct >= 0 ? "+" : ""}${h.weatherImpact.deliveryShiftPct.toFixed(0)}%.` : ""}`
          : "Sync weather forecast from location address to learn rain/delivery patterns.",
        severity: h.weatherImpact && Math.abs(h.weatherImpact.avgImpactPct) > 15 ? "MEDIUM" : "LOW",
        category: "GENERAL",
      });
      insights.push({
        title: "Which local events, holidays, and sports games boost traffic?",
        description:
          h.topEvents.length > 0
            ? h.topEvents.map((e) => `${e.description} (+${e.impactPct.toFixed(0)}%, ${e.category})`).join("; ")
            : "No events logged — add concerts, holidays, and game nights.",
        severity: h.topEvents.some((e) => e.impactPct > 25) ? "MEDIUM" : "LOW",
        category: "GENERAL",
      });
      insights.push({
        title: "What patterns has the system learned automatically?",
        description:
          h.learnedPatterns.length > 0
            ? h.learnedPatterns.map((p) => `${p.insight} (${p.confidence} confidence, n=${p.sampleSize})`).join("; ")
            : "Need more order history paired with external factors to auto-learn.",
        severity: h.learnedPatterns.some((p) => p.confidence === "high") ? "MEDIUM" : "LOW",
        category: "GENERAL",
      });
      if (h.tourismLevel) {
        insights.push({
          title: `Tourism level: ${h.tourismLevel}`,
          description: ex.byCategory.find((c) => c.category === "tourism")
            ? `Tourism factors avg ${ex.byCategory.find((c) => c.category === "tourism")!.avgImpactPct.toFixed(0)}% impact.`
            : "Monitor conventions and visitor traffic.",
          severity: "LOW",
          category: "GENERAL",
        });
      }
      if (ex.weatherForecast.length > 0) {
        const rainy = ex.weatherForecast.filter((f) => f.isRainy).length;
        insights.push({
          title: "Upcoming weather forecast",
          description: `${rainy} rainy day(s) in next 7 days via ${ex.weatherSource}${ex.weatherGeo ? ` (${ex.weatherGeo})` : ""}. Staff delivery and adjust inventory.`,
          severity: rainy > 2 ? "MEDIUM" : "LOW",
          category: "GENERAL",
        });
      }
      for (const cov of h.categoryCoverage.filter((c) => c.learned || c.tracked)) {
        const pattern = h.learnedPatterns.find((p) => p.category === cov.category);
        insights.push({
          title: `${cov.label} impact`,
          description: pattern
            ? pattern.insight
            : cov.avgImpactPct != null
              ? `Tracked ${cov.label.toLowerCase()} avg ${cov.avgImpactPct >= 0 ? "+" : ""}${cov.avgImpactPct.toFixed(0)}% impact.`
              : `${cov.label} data is being collected.`,
          severity: pattern?.confidence === "high" ? "MEDIUM" : "LOW",
          category: "GENERAL",
        });
      }
      break;
    }
  }

  const fromGlobal = payload.aiInsights.filter((i) => {
    const map: Partial<Record<AnalyticsSection, string[]>> = {
      executive: ["EXECUTIVE", "FINANCE", "OPERATIONS", "INVENTORY", "STAFFING"],
      sales: ["SALES", "MENU", "OPERATIONS", "FINANCE", "STAFFING"],
      food: ["INVENTORY", "FINANCE", "MENU"],
      labor: ["STAFFING", "FINANCE"],
      menu: ["MENU", "FINANCE"],
      marketing: ["FINANCE", "GENERAL", "CUSTOMER"],
      customer: ["CUSTOMER"],
      operations: ["OPERATIONS", "STAFFING"],
      purchasing: ["FINANCE", "INVENTORY"],
      forecasting: ["STAFFING", "INVENTORY", "GENERAL"],
      profitability: ["FINANCE"],
      external: ["GENERAL"],
    };
    const cats = map[section];
    return cats ? cats.includes(i.category) : false;
  });

  const merged = [...insights, ...fromGlobal];
  const seen = new Set<string>();
  return merged.filter((i) => {
    if (seen.has(i.title)) return false;
    seen.add(i.title);
    return true;
  }).slice(0, 6);
}

export async function generateSectionInsights(
  locationId: string,
  section: AnalyticsSection
): Promise<AnalyticsInsight[]> {
  if (!ANALYTICS_SECTIONS.includes(section)) {
    throw new Error(`Invalid analytics section: ${section}`);
  }

  const payload = await computeAnalytics(locationId);
  const snapshot = sectionPayload(payload, section);

  if (!openai) {
    return ruleBasedSectionInsights(payload, section);
  }

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are a restaurant analytics expert analyzing the "${SECTION_LABELS[section]}" section. Answer the section's key questions using only the provided data. Return JSON with an insights array (3-5 items). Each insight: title, description, category (string), severity (LOW|MEDIUM|HIGH|CRITICAL). Be specific with numbers. Include actionable recommendations.${section === "food" ? " For food & inventory you MUST include dedicated insights that answer: (1) Where is product disappearing? — use highlights.productDisappearing, wasteByReason, wasteCost, spoilageCost; (2) Which items are driving food cost increases? — use highlights.costIncreaseDrivers and topCostDrivers; (3) Are recipes being followed? — use highlights.recipeCompliance and recipeCosts. Also reference critical metrics: food cost %, theoretical vs actual variance, inventory turnover, days on hand." : ""}${section === "labor" ? " For labor you MUST include dedicated insights that answer: (1) Are we overstaffed or understaffed? — use highlights.staffingStatus and highlights.staffingReason; (2) Which shifts are inefficient? — use highlights.inefficientShifts and byShift; (3) Which employees produce the best results? — use highlights.topPerformers and byEmployee. Also reference critical metrics: labor %, sales per labor hour, guests per labor hour, overtime %, labor variance." : ""}${section === "menu" ? " For menu engineering you MUST include dedicated insights that answer: (1) What should we promote? — use highlights.promoteItems (stars and puzzles); (2) What should we reprice? — use highlights.repriceItems (plowhorses); (3) What should we remove? — use highlights.removeItems (dogs). Reference item sales volume, contribution margin, popularity %, recipe cost, and menu mix. Classify items as stars, plowhorses, puzzles, or dogs." : ""}${section === "marketing" ? " For marketing & guest acquisition you MUST include dedicated insights that answer: (1) Is marketing actually generating sales? — use highlights.salesGenerating; (2) Which channels bring profitable customers? — use highlights.profitableChannels and campaigns. Reference marketing spend, CAC, ROAS, LTV, repeat visit rate, coupon usage, email, social, website, and Google Business metrics." : ""}${section === "customer" ? " For guest experience you MUST include dedicated insights that answer: (1) What is hurting guest satisfaction? — use highlights.satisfactionHurts, complaintCategories, sentiment; (2) Which locations or shifts create complaints? — use highlights.complaintHotspots and complaintsByDaypart. Monitor Google and OpenTable reviews. Reference star ratings, survey results, resolution times, and guest sentiment." : ""}${section === "operations" ? " For operations you MUST include dedicated insights that answer: (1) Where are bottlenecks? — use highlights.bottlenecks, ticketTimesByDaypart, ticketTimesByHour; (2) Are long ticket times hurting sales? — use highlights.ticketTimeImpact. Reference ticket times, kitchen production times, order accuracy, voids, discounts, comps, and refunds." : ""}${section === "purchasing" ? " For purchasing answer: (1) Which suppliers are increasing costs? — highlights.costIncreaseSuppliers; (2) Are we paying market rates? — highlights.marketRateStatus." : ""}${section === "forecasting" ? " For forecasting & planning you MUST include dedicated insights that answer: (1) How much staff do I need next Friday? — highlights.staffNeededNextFriday and laborHoursForecast7d; (2) How much of every item should I order tomorrow? — highlights.inventoryOrderTomorrow (list ALL items with order quantity and on-hand). Also reference salesForecast7d (sales), laborHoursForecast7d (labor needs), inventoryOrderTomorrow (inventory needs for every SKU), cateringDemandForecast7d and highlights.cateringDemandNext7d (catering demand), and seasonalTrends / highlights.seasonalTrend (seasonal trends)." : ""}${section === "profitability" ? " For the Profitability Dashboard (most important) you MUST answer: (1) Where is profit leaking? — highlights.profitLeaks; (2) Which menu items, hours, days, and channels drive profit? — byMenuItem, byHour, byDay, byChannel, highlights.topProfitItem/Hour/Day/Channel; (3) Which employees, shifts, and campaigns are most profitable? — byEmployee, byShift, byCampaign, byDeliveryProvider, highlights.topProfitEmployee/topCampaign/lowestProfitShift. Reference ALL profit dimensions: byMenuItem, byCategory, byEmployee, byShift, byDaypart, byHour, byDay, byLocation, byChannel, byDeliveryProvider, byCampaign." : ""}${section === "external" ? " For external factors (often ignored but critical) you MUST answer ALL THREE key questions and cover ALL SIX categories (weather, event, holiday, sports, tourism, school). (1) How does weather affect sales and delivery? — highlights.weatherImpact, learnedPatterns for weather, weatherForecast; example: rainy days increase delivery ~25%. (2) Which local events, holidays, and sports games boost traffic? — highlights.topEvents, byCategory, categoryCoverage; example: concert nights +40%. (3) What patterns has the system learned automatically? — learnedPatterns with confidence and sampleSize. Reference tourismLevel, schoolScheduleNote, categoryCoverage, and weatherSource/weatherGeo." : ""}`,
        },
        {
          role: "user",
          content: JSON.stringify(snapshot),
        },
      ],
      max_tokens: 1000,
      response_format: { type: "json_object" },
    });

    const content = response.choices[0]?.message?.content;
    if (content) {
      const parsed = JSON.parse(content);
      const items = (parsed.insights || []) as AnalyticsInsight[];
      if (items.length > 0) return items.slice(0, 6);
    }
  } catch (error) {
    console.error(`Section insight error (${section}):`, error);
  }

  return ruleBasedSectionInsights(payload, section);
}
