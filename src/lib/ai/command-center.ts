import { prisma } from "../prisma";
import { computeAnalytics, buildAnalyticsSnapshotForAI } from "../analytics/compute";
import type { AnalyticsPayload } from "../analytics/types";

export type CommandDomain =
  | "sales"
  | "labor"
  | "inventory"
  | "scheduling"
  | "vendors"
  | "waste"
  | "reviews"
  | "employees"
  | "operations"
  | "profitability"
  | "menu";

export type SignalStatus = "green" | "yellow" | "red";

export interface CommandCenterSignal {
  domain: CommandDomain;
  label: string;
  value: string;
  status: SignalStatus;
  detail?: string;
}

export interface CommandCenterFinding {
  domain: CommandDomain;
  severity: "high" | "medium" | "low";
  title: string;
  evidence: string;
  impact: string;
  action: string;
}

export interface CommandCenterMetric {
  label: string;
  value: string;
  subtext?: string;
}

export interface CommandCenterSnapshot {
  scannedAt: string;
  periodDays: number;
  locationName: string;
  sales: {
    netSales: number;
    avgCheck: number;
    guestCount: number;
    orderCount: number;
  };
  labor: {
    laborPct: number;
    staffingStatus: string;
    overtimeHours: number;
    scheduledHours: number;
    actualHours: number;
    inefficientShifts: string[];
  };
  foodCost: {
    foodCostPct: number;
    variancePct: number;
    wasteCost: number;
    spoilageCost: number;
    primaryVarianceCause: string | null;
  };
  inventory: {
    lowStockCount: number;
    lowStockItems: string[];
    valuation: number;
    unavailableMenu: string[];
  };
  scheduling: {
    shiftsNext7d: number;
    staffScheduled: number;
    hoursVariance: number;
  };
  vendors: {
    totalSpend: number;
    costInflationPct: number;
    topVendor: string | null;
    risingPrices: Array<{ vendor: string; changePct: number }>;
  };
  waste: {
    totalCost: number;
    entryCount: number;
    topReasons: Array<{ reason: string; cost: number }>;
  };
  reviews: {
    avgRating: number;
    count: number;
    negativeCount: number;
    unresolvedCount: number;
    topComplaints: string[];
  };
  employees: {
    activeCount: number;
    underperformers: Array<{ name: string; salesPerHour: number }>;
    topPerformers: Array<{ name: string; salesPerHour: number }>;
  };
  operations: {
    voidTotal: number;
    voidRatePct: number;
    discountTotal: number;
    discountRatePct: number;
    compTotal: number;
    compRatePct: number;
    avgTicketMinutes: number;
  };
  profitability: {
    netProfit: number;
    marginPct: number;
    primeCostPct: number;
    profitLeaks: Array<{ area: string; amount: number; reason: string }>;
  };
  alerts: Array<{ message: string; severity: string; type: string }>;
  analytics: ReturnType<typeof buildAnalyticsSnapshotForAI>;
  rawAnalytics: AnalyticsPayload;
}

export interface CommandCenterResponse {
  mode: "command_center";
  question: string;
  intent: string;
  headline: string;
  summary: string;
  answer: string;
  signals: CommandCenterSignal[];
  findings: CommandCenterFinding[];
  metrics: CommandCenterMetric[];
  domainsScanned: CommandDomain[];
  relatedActions: string[];
  confidence: "high" | "medium" | "low";
  usedAI: boolean;
  categoryId: string;
  categoryLabel: string;
  sources: string[];
}

const DOMAIN_LABELS: Record<CommandDomain, string> = {
  sales: "Sales",
  labor: "Labor",
  inventory: "Inventory",
  scheduling: "Scheduling",
  vendors: "Vendors",
  waste: "Waste",
  reviews: "Reviews",
  employees: "Employees",
  operations: "Operations",
  profitability: "Profitability",
  menu: "Menu",
};

const ALL_DOMAINS: CommandDomain[] = [
  "sales",
  "labor",
  "inventory",
  "scheduling",
  "vendors",
  "waste",
  "reviews",
  "employees",
  "operations",
  "profitability",
  "menu",
];

function fmtMoney(n: number) {
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function fmtPct(n: number) {
  return `${n.toFixed(1)}%`;
}

function statusFromThreshold(
  value: number,
  greenMax: number,
  yellowMax: number,
  invert = false
): SignalStatus {
  if (invert) {
    if (value >= greenMax) return "green";
    if (value >= yellowMax) return "yellow";
    return "red";
  }
  if (value <= greenMax) return "green";
  if (value <= yellowMax) return "yellow";
  return "red";
}

export async function buildCommandCenterSnapshot(
  locationId: string
): Promise<CommandCenterSnapshot> {
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const weekAhead = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const [
    location,
    inventory,
    menuItems,
    staff,
    shifts,
    reviews,
    vendorInvoices,
    wasteEntries,
    analyticsPayload,
  ] = await Promise.all([
    prisma.location.findUnique({ where: { id: locationId } }),
    prisma.inventoryItem.findMany({ where: { locationId } }),
    prisma.menuItem.findMany({ where: { locationId } }),
    prisma.staffMember.findMany({ where: { locationId, active: true } }),
    prisma.shift.findMany({
      where: { locationId, date: { gte: new Date(), lte: weekAhead } },
      include: { staffMember: true },
    }),
    prisma.guestReview.findMany({
      where: { locationId, createdAt: { gte: monthAgo } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.vendorInvoice.findMany({
      where: { locationId, invoiceDate: { gte: monthAgo } },
      orderBy: { invoiceDate: "desc" },
    }),
    prisma.inventoryWaste.findMany({
      where: { locationId, date: { gte: monthAgo } },
      orderBy: { cost: "desc" },
    }),
    computeAnalytics(locationId),
  ]);

  const a = buildAnalyticsSnapshotForAI(analyticsPayload);
  const lowStock = inventory.filter((i) => i.quantity <= i.minQuantity);
  const unavailable = menuItems.filter((m) => !m.available);

  const wasteByReason = new Map<string, number>();
  for (const w of wasteEntries) {
    wasteByReason.set(w.reason, (wasteByReason.get(w.reason) ?? 0) + w.cost);
  }
  const topWasteReasons = [...wasteByReason.entries()]
    .map(([reason, cost]) => ({ reason, cost }))
    .sort((x, y) => y.cost - x.cost)
    .slice(0, 5);

  const wasteTotal =
    wasteEntries.reduce((s, w) => s + w.cost, 0) || a.foodCost.wasteCost + a.foodCost.spoilageCost;

  const vendorSpend = vendorInvoices.reduce((s, v) => s + v.amount, 0);
  const risingPrices = vendorInvoices
    .filter((v) => v.priceChangePct > 3)
    .slice(0, 5)
    .map((v) => ({ vendor: v.vendor, changePct: v.priceChangePct }));

  const topVendor =
    a.purchasing.topVendors[0]?.vendor ??
    (vendorInvoices.length
      ? vendorInvoices.reduce(
          (best, v) => (v.amount > best.amount ? v : best),
          vendorInvoices[0]
        ).vendor
      : null);

  const negativeReviews = reviews.filter((r) => r.rating < 3);
  const complaintCounts = new Map<string, number>();
  for (const r of reviews.filter((r) => r.rating <= 3 && r.category)) {
    complaintCounts.set(r.category!, (complaintCounts.get(r.category!) ?? 0) + 1);
  }
  const topComplaints = [...complaintCounts.entries()]
    .sort((x, y) => y[1] - x[1])
    .slice(0, 4)
    .map(([c]) => c);

  const underperformers = (a.labor.byEmployee ?? [])
    .filter((e) => e.salesPerLaborHour < 80 && e.actualHours > 2)
    .slice(0, 4)
    .map((e) => ({ name: e.name, salesPerHour: e.salesPerLaborHour }));

  const topPerformers = (a.labor.highlights?.topPerformers ?? []).slice(0, 4).map((e) => ({
    name: e.name,
    salesPerHour: e.salesPerLaborHour,
  }));

  const primeCost = a.foodCost.foodCostPct + a.labor.laborPct;
  const uniqueStaffScheduled = new Set(shifts.map((s) => s.staffMemberId)).size;

  return {
    scannedAt: new Date().toISOString(),
    periodDays: a.periodDays,
    locationName: location?.name ?? "Your restaurant",
    sales: {
      netSales: a.sales.netSales,
      avgCheck: a.sales.averageCheck,
      guestCount: a.sales.guestCount,
      orderCount: analyticsPayload.sales.byDaypart.reduce((s, d) => s + d.orders, 0),
    },
    labor: {
      laborPct: a.labor.laborPct,
      staffingStatus: a.labor.highlights?.staffingStatus ?? "balanced",
      overtimeHours: a.labor.overtimeHours,
      scheduledHours: a.labor.scheduledHours,
      actualHours: a.labor.actualHours,
      inefficientShifts: (a.labor.highlights?.inefficientShifts ?? []).map((s) => s.label),
    },
    foodCost: {
      foodCostPct: a.foodCost.foodCostPct,
      variancePct: a.foodCost.variancePct,
      wasteCost: a.foodCost.wasteCost,
      spoilageCost: a.foodCost.spoilageCost,
      primaryVarianceCause: a.foodCost.highlights?.productDisappearing?.primaryCause ?? null,
    },
    inventory: {
      lowStockCount: lowStock.length,
      lowStockItems: lowStock.slice(0, 8).map((i) => i.name),
      valuation: analyticsPayload.foodCost.inventoryValuation,
      unavailableMenu: unavailable.map((m) => m.name),
    },
    scheduling: {
      shiftsNext7d: shifts.length,
      staffScheduled: uniqueStaffScheduled,
      hoursVariance: a.labor.laborVarianceHours,
    },
    vendors: {
      totalSpend: vendorSpend || a.purchasing.totalPurchases,
      costInflationPct: a.purchasing.costInflationPct,
      topVendor,
      risingPrices,
    },
    waste: {
      totalCost: wasteTotal,
      entryCount: wasteEntries.length,
      topReasons: topWasteReasons,
    },
    reviews: {
      avgRating: a.customerExperience.avgRating,
      count: reviews.length || a.customerExperience.reviewCount,
      negativeCount: negativeReviews.length,
      unresolvedCount: reviews.filter((r) => !r.resolved && r.rating < 4).length,
      topComplaints,
    },
    employees: {
      activeCount: staff.length,
      underperformers,
      topPerformers,
    },
    operations: {
      voidTotal: a.operations.voidTotal,
      voidRatePct: a.operations.voidRatePct,
      discountTotal: a.operations.discountTotal,
      discountRatePct: a.operations.discountRatePct,
      compTotal: a.operations.compTotal,
      compRatePct: a.operations.compRatePct,
      avgTicketMinutes: a.operations.avgTicketTimeMinutes,
    },
    profitability: {
      netProfit: a.profitability.netProfitEstimate,
      marginPct: a.profitability.profitMarginPct,
      primeCostPct: primeCost,
      profitLeaks: a.profitability.highlights?.profitLeaks ?? [],
    },
    alerts: (a.executiveAlerts ?? []).map((al) => ({
      message: al.message,
      severity: al.severity,
      type: al.type,
    })),
    analytics: a,
    rawAnalytics: analyticsPayload,
  };
}

export function buildLiveSignals(snapshot: CommandCenterSnapshot): CommandCenterSignal[] {
  const { sales, labor, foodCost, inventory, reviews, operations, profitability } = snapshot;

  return [
    {
      domain: "sales",
      label: "Sales",
      value: fmtMoney(sales.netSales),
      status: sales.netSales > 0 ? "green" : "red",
      detail: `${sales.guestCount} guests · ${fmtMoney(sales.avgCheck)} avg check`,
    },
    {
      domain: "profitability",
      label: "Profit",
      value: fmtMoney(profitability.netProfit),
      status: statusFromThreshold(profitability.marginPct, 15, 8, true),
      detail: `${fmtPct(profitability.marginPct)} margin · ${fmtPct(profitability.primeCostPct)} prime`,
    },
    {
      domain: "labor",
      label: "Labor",
      value: fmtPct(labor.laborPct),
      status: statusFromThreshold(labor.laborPct, 30, 35),
      detail: `${labor.staffingStatus} · ${labor.overtimeHours.toFixed(1)}h OT`,
    },
    {
      domain: "inventory",
      label: "Food Cost",
      value: fmtPct(foodCost.foodCostPct),
      status: statusFromThreshold(foodCost.foodCostPct, 30, 35),
      detail:
        inventory.lowStockCount > 0
          ? `${inventory.lowStockCount} items low`
          : `Variance ${fmtPct(foodCost.variancePct)}`,
    },
    {
      domain: "reviews",
      label: "Guests",
      value: reviews.avgRating > 0 ? `${reviews.avgRating.toFixed(1)}★` : "—",
      status: statusFromThreshold(reviews.avgRating, 4.2, 3.8, true),
      detail:
        reviews.negativeCount > 0
          ? `${reviews.negativeCount} negative reviews`
          : `${reviews.count} reviews`,
    },
    {
      domain: "operations",
      label: "Ops",
      value: `${operations.avgTicketMinutes.toFixed(0)}m`,
      status: statusFromThreshold(operations.avgTicketMinutes, 18, 25),
      detail: `Voids ${fmtPct(operations.voidRatePct)} · Disc ${fmtPct(operations.discountRatePct)}`,
    },
  ];
}

export type CommandIntent =
  | "profit_hurt"
  | "profit_improve"
  | "status"
  | "problems"
  | "briefing"
  | "general";

export function detectCommandIntent(question: string): CommandIntent {
  const q = question.toLowerCase();
  if (/hurt.*profit|profit.*hurt|losing money|where.*losing|profit leak|margin.*hurt|eating.*profit|killing.*profit/.test(q))
    return "profit_hurt";
  if (/improve profit|increase profit|boost margin|fix margin/.test(q)) return "profit_improve";
  if (/red.?yellow.?green|status report|how.*(doing|performing)|health score|overall/.test(q))
    return "status";
  if (/problem|attention|issue|wrong|fix first|needs/.test(q)) return "problems";
  if (/briefing|focus.*today|summary|what changed/.test(q)) return "briefing";
  return "general";
}

function finding(
  domain: CommandDomain,
  severity: CommandCenterFinding["severity"],
  title: string,
  evidence: string,
  impact: string,
  action: string
): CommandCenterFinding {
  return { domain, severity, title, evidence, impact, action };
}

export function analyzeProfitHurt(snapshot: CommandCenterSnapshot): CommandCenterResponse {
  const findings: CommandCenterFinding[] = [];
  const actions: string[] = [];
  const { profitability, foodCost, labor, waste, vendors, operations, reviews } = snapshot;
  const a = snapshot.analytics;

  for (const leak of profitability.profitLeaks) {
    const domain: CommandDomain =
      leak.area.startsWith("Menu") ? "menu" : leak.area === "Voids" || leak.area === "Discounts" ? "operations" : "profitability";
    findings.push(
      finding(
        domain,
        leak.amount > 500 ? "high" : "medium",
        `${leak.area} draining margin`,
        leak.reason,
        fmtMoney(leak.amount),
        leak.area === "Voids"
          ? "Audit void patterns by employee and shift"
          : leak.area === "Discounts"
            ? "Tighten comp/discount approval rules"
            : `Review ${leak.area.replace("Menu: ", "")} pricing and prep cost`
      )
    );
  }

  if (foodCost.foodCostPct > 32) {
    findings.push(
      finding(
        "inventory",
        foodCost.foodCostPct > 36 ? "high" : "medium",
        "Food cost above target",
        `Running ${fmtPct(foodCost.foodCostPct)} vs 28–32% benchmark${foodCost.primaryVarianceCause ? ` · ${foodCost.primaryVarianceCause}` : ""}`,
        fmtMoney(foodCost.wasteCost + foodCost.spoilageCost),
        "Audit portion sizes, prep pars, and receiving weights"
      )
    );
  }

  if (foodCost.variancePct > 2) {
    const drivers = a.foodCost.highlights?.costIncreaseDrivers?.slice(0, 3) ?? [];
    findings.push(
      finding(
        "inventory",
        "medium",
        "Theoretical vs actual food cost gap",
        drivers.length
          ? `Top drivers: ${drivers.map((d) => `${d.name} (+${d.changePct.toFixed(0)}%)`).join(", ")}`
          : `${fmtPct(foodCost.variancePct)} variance — product may be disappearing`,
        "—",
        "Reconcile inventory counts and investigate shrinkage"
      )
    );
  }

  if (waste.totalCost > 100) {
    const reasons = waste.topReasons.slice(0, 2).map((r) => `${r.reason} (${fmtMoney(r.cost)})`).join(", ");
    findings.push(
      finding(
        "waste",
        waste.totalCost > 400 ? "high" : "medium",
        "Food waste eroding profit",
        reasons || `${waste.entryCount} waste entries logged`,
        fmtMoney(waste.totalCost),
        "Cut prep on slow movers and tighten spoilage rotation"
      )
    );
  }

  if (labor.laborPct > 32) {
    findings.push(
      finding(
        "labor",
        labor.laborPct > 36 ? "high" : "medium",
        "Labor cost high for sales volume",
        `${fmtPct(labor.laborPct)} labor · ${labor.staffingStatus} · ${labor.overtimeHours.toFixed(1)}h overtime`,
        fmtMoney((labor.laborPct - 30) * 0.01 * snapshot.sales.netSales),
        labor.inefficientShifts.length
          ? `Trim ${labor.inefficientShifts[0]} staffing`
          : "Cut slow-shift hours or redeploy to peak"
      )
    );
  }

  if (labor.inefficientShifts.length) {
    findings.push(
      finding(
        "scheduling",
        "medium",
        "Inefficient labor on slow shifts",
        labor.inefficientShifts.join(", "),
        "—",
        "Align schedule to forecasted daypart demand"
      )
    );
  }

  if (vendors.costInflationPct > 5 || vendors.risingPrices.length) {
    const rising = vendors.risingPrices
      .slice(0, 3)
      .map((v) => `${v.vendor} (+${v.changePct.toFixed(0)}%)`)
      .join(", ");
    findings.push(
      finding(
        "vendors",
        vendors.costInflationPct > 10 ? "high" : "medium",
        "Vendor costs rising",
        rising || `${fmtPct(vendors.costInflationPct)} inflation across invoices`,
        fmtMoney(vendors.totalSpend * (vendors.costInflationPct / 100)),
        "Renegotiate top SKUs or switch to cheaper vendor quotes"
      )
    );
  }

  const twm = a.purchasing?.highlights?.threeWayMatch ?? a.purchasing?.threeWayMatch;
  if (twm && twm.discrepancyCount > 0) {
    const top = twm.openIssues[0];
    findings.push(
      finding(
        "vendors",
        twm.holdPaymentTotal > 200 ? "high" : "medium",
        "Three-way match failed — hold payment",
        top
          ? `${top.vendor}: ${top.issue}`
          : `${twm.discrepancyCount} invoice(s) do not match PO/receipt`,
        fmtMoney(twm.holdPaymentTotal),
        "Do not pay until short-ships or price variances are credited"
      )
    );
  }

  const dig = a.purchasing?.highlights?.invoiceDigitization;
  if (dig?.recentPriceSpikes && dig.topSpike) {
    findings.push(
      finding(
        "vendors",
        dig.topSpike.changePct >= 15 ? "high" : "medium",
        `Price spike: ${dig.topSpike.item}`,
        `${dig.topSpike.vendor || "Vendor"} raised price +${dig.topSpike.changePct.toFixed(0)}% — recipe costs updated`,
        "",
        "Review menu pricing and negotiate with vendor"
      )
    );
  }
  if (dig?.catchWeightAlerts) {
    const cw = dig.openCatchWeightIssues[0];
    findings.push(
      finding(
        "vendors",
        "medium",
        "Catch-weight billing mismatch",
        cw?.description ?? `${dig.catchWeightAlerts} case item(s) billed for more weight than received`,
        "",
        "Request vendor credit for billed vs received weight"
      )
    );
  }

  const cm = a.purchasing?.highlights?.creditMemoTracking;
  if (cm && cm.openCount > 0) {
    findings.push(
      finding(
        "vendors",
        cm.openTotal > 200 ? "high" : "medium",
        `${cm.openCount} open vendor credit(s)`,
        cm.recentOpen[0]
          ? `${cm.recentOpen[0].vendor}: ${cm.recentOpen[0].reason}`
          : `${cm.openTotal.toFixed(0)} pending from vendors`,
        cm.accountingLockedCount > 0 ? `${cm.accountingLockedCount} invoice(s) locked from AP sync` : "",
        "Do not pay full invoices until credit memos are applied"
      )
    );
  }

  const sc = a.purchasing?.highlights?.vendorScorecards;
  if (sc?.worstVendor && sc.worstVendor.reliabilityScore < 80) {
    findings.push(
      finding(
        "vendors",
        sc.worstVendor.reliabilityScore < 65 ? "high" : "medium",
        `Low vendor score: ${sc.worstVendor.vendor}`,
        `Fill ${sc.worstVendor.fillRatePct}% · on-time ${sc.worstVendor.onTimePct}% · substitutions ${sc.worstVendor.substitutionRatePct}%`,
        `Grade ${sc.worstVendor.reliabilityGrade}`,
        "Use scorecard data in contract negotiations or switch suppliers"
      )
    );
  }

  const dogs = a.menuEngineering.highlights?.removeItems ?? [];
  for (const dog of dogs.slice(0, 2)) {
    findings.push(
      finding(
        "menu",
        "medium",
        `Low-margin item: ${dog.name}`,
        `${fmtPct(dog.marginPct)} margin · ${dog.quantitySold} sold · ${fmtMoney(dog.contribution)} contribution`,
        fmtMoney(Math.abs(dog.contribution)),
        "Reprice, rework recipe, or remove from menu"
      )
    );
  }

  const reprice = a.menuEngineering.highlights?.repriceItems ?? [];
  if (reprice.length) {
    findings.push(
      finding(
        "menu",
        "medium",
        "Popular items with thin margins",
        reprice
          .slice(0, 3)
          .map((i) => `${i.name} (${fmtPct(i.marginPct)} margin)`)
          .join(", "),
        "—",
        "Raise prices $0.50–$1.50 on high-volume puzzles/plowhorses"
      )
    );
  }

  if (operations.discountRatePct > 4 || operations.compRatePct > 2) {
    findings.push(
      finding(
        "operations",
        operations.discountRatePct > 6 ? "high" : "medium",
        "Discounts and comps above norm",
        `Discounts ${fmtMoney(operations.discountTotal)} (${fmtPct(operations.discountRatePct)}) · Comps ${fmtMoney(operations.compTotal)} (${fmtPct(operations.compRatePct)})`,
        fmtMoney(operations.discountTotal + operations.compTotal),
        "Require manager approval and track by employee"
      )
    );
  }

  if (reviews.negativeCount >= 2 || reviews.avgRating < 4) {
    findings.push(
      finding(
        "reviews",
        reviews.avgRating < 3.5 ? "high" : "medium",
        "Guest dissatisfaction hurting repeat business",
        `${reviews.negativeCount} negative reviews · ${reviews.avgRating.toFixed(1)}★ avg${reviews.topComplaints.length ? ` · top issues: ${reviews.topComplaints.join(", ")}` : ""}`,
        "—",
        "Coach service on complaint hotspots and respond to reviews"
      )
    );
  }

  if (snapshot.inventory.lowStockCount > 2) {
    findings.push(
      finding(
        "inventory",
        "medium",
        "Stockouts risking lost sales",
        snapshot.inventory.lowStockItems.join(", "),
        "—",
        "Place urgent order and 86 items until restocked"
      )
    );
  }

  if (snapshot.employees.underperformers.length) {
    findings.push(
      finding(
        "employees",
        "low",
        "Underperforming staff on labor cost",
        snapshot.employees.underperformers
          .map((e) => `${e.name} ($${e.salesPerHour.toFixed(0)}/hr)`)
          .join(", "),
        "—",
        "Coach upselling and table turns; adjust scheduling"
      )
    );
  }

  for (const alert of snapshot.alerts) {
    findings.push(
      finding(
        "operations",
        alert.severity === "HIGH" || alert.severity === "CRITICAL" ? "high" : "medium",
        alert.message,
        `Executive alert: ${alert.type}`,
        "—",
        "Resolve before next service period"
      )
    );
  }

  const severityOrder = { high: 0, medium: 1, low: 2 };
  findings.sort((x, y) => severityOrder[x.severity] - severityOrder[y.severity]);

  const top = findings.filter((f) => f.severity === "high")[0] ?? findings[0];
  const headline = top
    ? `${top.title} is your biggest profit drag this week`
    : profitability.netProfit > 0
      ? `Profit looks healthy at ${fmtMoney(profitability.netProfit)} (${fmtPct(profitability.marginPct)} margin)`
      : "No major profit leaks detected — margins are stable";

  const summaryParts = [
    `${fmtMoney(snapshot.sales.netSales)} net sales over ${snapshot.periodDays} days`,
    `${fmtPct(profitability.primeCostPct)} prime cost`,
    `${fmtMoney(profitability.netProfit)} estimated profit`,
  ];

  const answerLines = [
    headline,
    "",
    `Cross-checked **sales, labor, inventory, scheduling, vendor invoices, waste, reviews, and employee data** for ${snapshot.locationName}.`,
    "",
    `**This week:** ${summaryParts.join(" · ")}.`,
    "",
    findings.length
      ? "**What's hurting profit:**"
      : "**Assessment:** No significant profit drains found.",
  ];

  for (const [i, f] of findings.slice(0, 8).entries()) {
    answerLines.push(
      "",
      `${i + 1}. **${f.title}** (${DOMAIN_LABELS[f.domain]})`,
      `   ${f.evidence}`,
      f.impact !== "—" ? `   Impact: ${f.impact}` : "",
      `   → ${f.action}`
    );
    actions.push(f.action);
  }

  return {
    mode: "command_center",
    question: "What's hurting my profit this week?",
    intent: "profit_hurt",
    headline,
    summary: summaryParts.join(" · "),
    answer: answerLines.filter(Boolean).join("\n"),
    signals: buildLiveSignals(snapshot),
    findings: findings.slice(0, 10),
    metrics: [
      { label: "Net Sales", value: fmtMoney(snapshot.sales.netSales) },
      { label: "Est. Profit", value: fmtMoney(profitability.netProfit), subtext: fmtPct(profitability.marginPct) },
      { label: "Prime Cost", value: fmtPct(profitability.primeCostPct) },
      { label: "Food Cost", value: fmtPct(foodCost.foodCostPct) },
      { label: "Labor", value: fmtPct(labor.laborPct) },
      { label: "Waste", value: fmtMoney(waste.totalCost) },
    ],
    domainsScanned: ALL_DOMAINS,
    relatedActions: [...new Set(actions)].slice(0, 6),
    confidence: findings.length ? "high" : "medium",
    usedAI: false,
    categoryId: "profit_cost",
    categoryLabel: "Profit & Cost Control",
    sources: ALL_DOMAINS,
  };
}

export function analyzeCommandStatus(snapshot: CommandCenterSnapshot): CommandCenterResponse {
  const signals = buildLiveSignals(snapshot);
  const red = signals.filter((s) => s.status === "red");
  const yellow = signals.filter((s) => s.status === "yellow");

  const headline =
    red.length > 0
      ? `${red.map((s) => s.label).join(" & ")} need immediate attention`
      : yellow.length > 0
        ? `${yellow.length} areas on watch — overall operations manageable`
        : "All systems green — restaurant performing well";

  const findings: CommandCenterFinding[] = [];
  for (const s of signals.filter((x) => x.status !== "green")) {
    findings.push(
      finding(
        s.domain,
        s.status === "red" ? "high" : "medium",
        `${s.label} at ${s.value}`,
        s.detail ?? "",
        "—",
        s.status === "red" ? `Address ${s.label.toLowerCase()} before next rush` : `Monitor ${s.label.toLowerCase()} closely`
      )
    );
  }

  return {
    mode: "command_center",
    question: "Restaurant status",
    intent: "status",
    headline,
    summary: `${snapshot.locationName} · ${fmtMoney(snapshot.sales.netSales)} sales · ${fmtMoney(snapshot.profitability.netProfit)} profit`,
    answer: [
      headline,
      "",
      "**Signal board:**",
      ...signals.map((s) => `- ${s.label}: **${s.value}** (${s.status.toUpperCase()}) — ${s.detail}`),
    ].join("\n"),
    signals,
    findings,
    metrics: signals.map((s) => ({ label: s.label, value: s.value, subtext: s.detail })),
    domainsScanned: ALL_DOMAINS,
    relatedActions: findings.map((f) => f.action).slice(0, 5),
    confidence: "high",
    usedAI: false,
    categoryId: "daily_overview",
    categoryLabel: "Command Center",
    sources: ALL_DOMAINS,
  };
}

export function runCommandCenterAnalysis(
  snapshot: CommandCenterSnapshot,
  question: string,
  intent: CommandIntent
): CommandCenterResponse {
  if (intent === "profit_hurt") {
    const result = analyzeProfitHurt(snapshot);
    result.question = question;
    return result;
  }
  if (intent === "profit_improve") {
    const hurt = analyzeProfitHurt(snapshot);
    return {
      ...hurt,
      question,
      intent: "profit_improve",
      headline: `Top ${hurt.findings.length} levers to recover ${fmtMoney(snapshot.profitability.netProfit > 0 ? snapshot.profitability.netProfit * 0.15 : 500)}+ in margin`,
      categoryLabel: "Profit Recovery",
    };
  }
  if (intent === "status") return { ...analyzeCommandStatus(snapshot), question };
  if (intent === "problems" || intent === "briefing") {
    const hurt = analyzeProfitHurt(snapshot);
    return {
      ...hurt,
      question,
      intent,
      headline:
        intent === "briefing"
          ? `${snapshot.locationName} — ${fmtMoney(snapshot.sales.netSales)} sales, ${fmtPct(snapshot.profitability.primeCostPct)} prime cost`
          : hurt.findings.length
            ? `${hurt.findings.length} issues flagged across your operation`
            : "No critical issues — operation stable",
      categoryLabel: intent === "briefing" ? "Daily Briefing" : "Problem Scan",
    };
  }

  return analyzeProfitHurt(snapshot);
}

export { DOMAIN_LABELS, ALL_DOMAINS };
