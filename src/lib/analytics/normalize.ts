import type { AnalyticsPayload, CustomerExperienceHighlights, ExternalFactorsHighlights, FoodCostHighlights, ForecastingHighlights, LaborHighlights, MarketingHighlights, MenuEngineeringHighlights, OperationsHighlights, ProfitabilityHighlights, PurchasingHighlights, SalesHighlights } from "./types";
import { EXTERNAL_CATEGORY_LABELS, ALL_EXTERNAL_CATEGORIES } from "@/lib/external/pattern-learning";

const EMPTY_SALES_HIGHLIGHTS: SalesHighlights = {
  topSellingItem: null,
  busiestDaypart: null,
  busiestHour: null,
  mostProfitableChannel: null,
  highestVolumeChannel: null,
};

const EMPTY_FOOD_HIGHLIGHTS: FoodCostHighlights = {
  foodCostPct: 0,
  variancePct: 0,
  inventoryTurnover: 0,
  daysOnHand: 0,
  topWasteReason: null,
  vendorWithHighestIncrease: null,
  cheaperVendorOpportunity: null,
  productDisappearing: {
    primaryCause: "no data",
    wasteCost: 0,
    spoilageCost: 0,
    varianceGapPct: 0,
  },
  costIncreaseDrivers: [],
  recipeCompliance: {
    status: "on_track",
    theoreticalPct: 0,
    actualPct: 0,
    variancePct: 0,
    topDriftItem: null,
  },
};

const EMPTY_MARKETING_HIGHLIGHTS: MarketingHighlights = {
  salesGenerating: {
    status: "no_data",
    reason: "No marketing data available.",
    attributedRevenue: 0,
    returnOnAdSpend: 0,
  },
  profitableChannels: [],
};

const EMPTY_CUSTOMER_HIGHLIGHTS: CustomerExperienceHighlights = {
  satisfactionHurts: [],
  complaintHotspots: [],
  sentimentSummary: { positive: 0, neutral: 0, negative: 0, overall: "mixed" },
};

const EMPTY_OPERATIONS_HIGHLIGHTS: OperationsHighlights = {
  bottlenecks: [],
  ticketTimeImpact: {
    status: "no_data",
    reason: "No operations data available.",
    slowOrderPct: 0,
    avgTicketTimeMinutes: 0,
  },
};

const EMPTY_PURCHASING_HIGHLIGHTS: PurchasingHighlights = {
  costIncreaseSuppliers: [],
  marketRateStatus: { status: "unknown", reason: "No purchasing data." },
};

const EMPTY_FORECASTING_HIGHLIGHTS: ForecastingHighlights = {
  staffNeededNextFriday: { hours: 0, predictedSales: 0, date: "" },
  inventoryOrderDate: "",
  inventoryOrderTomorrow: [],
  cateringDemandNext7d: { orders: 0, sales: 0, trend: "stable" },
  seasonalTrend: { pattern: "", insight: "", peakDay: "", liftPct: 0 },
};

const EMPTY_PROFITABILITY_HIGHLIGHTS: ProfitabilityHighlights = {
  profitLeaks: [],
  marginDrivers: [],
  topProfitItem: null,
  topProfitHour: null,
  topProfitDay: null,
  topProfitEmployee: null,
  topProfitChannel: null,
  topCampaign: null,
  lowestProfitShift: null,
};

const DEFAULT_EXTERNAL_QUESTIONS = [
  "How does weather affect sales and delivery?",
  "Which local events, holidays, and sports games boost traffic?",
  "What patterns has the system learned automatically?",
];

const EMPTY_EXTERNAL_HIGHLIGHTS: ExternalFactorsHighlights = {
  weatherImpact: null,
  topEvents: [],
  learnedPatterns: [],
  upcomingForecast: [],
  tourismLevel: null,
  schoolScheduleNote: null,
  categoryCoverage: ALL_EXTERNAL_CATEGORIES.map((category) => ({
    category,
    label: EXTERNAL_CATEGORY_LABELS[category],
    tracked: false,
    learned: false,
    avgImpactPct: null,
  })),
};

const EMPTY_MENU_HIGHLIGHTS: MenuEngineeringHighlights = {
  promoteItems: [],
  repriceItems: [],
  removeItems: [],
  topContributor: null,
};

const EMPTY_LABOR_HIGHLIGHTS: LaborHighlights = {
  staffingStatus: "balanced",
  staffingReason: "No labor data available.",
  inefficientShifts: [],
  topPerformers: [],
};

/** Ensures analytics API responses always have fields the UI expects. */
export function normalizeAnalyticsPayload(
  raw: Partial<AnalyticsPayload> | AnalyticsPayload
): AnalyticsPayload {
  const sales = raw.sales ?? ({} as AnalyticsPayload["sales"]);
  const foodCost = raw.foodCost ?? ({} as AnalyticsPayload["foodCost"]);
  const executive = raw.executive ?? ({} as AnalyticsPayload["executive"]);

  return {
    generatedAt: (raw.generatedAt as string) ?? new Date().toISOString(),
    periodDays: (raw.periodDays as number) ?? 30,
    executive: {
      yesterday: executive.yesterday ?? {
        sales: 0,
        netSales: 0,
        foodCostPct: 0,
        laborPct: 0,
        primeCostPct: 0,
        profitEstimate: 0,
        guestCount: 0,
      },
      last7Days: executive.last7Days ?? {
        salesTrend: [],
        profitTrend: [],
        reviewTrend: [],
      },
      alerts: executive.alerts ?? [],
    },
    sales: {
      totalSales: sales.totalSales ?? 0,
      netSales: sales.netSales ?? 0,
      averageCheck: sales.averageCheck ?? 0,
      averageSpendPerGuest: sales.averageSpendPerGuest ?? 0,
      guestCount: sales.guestCount ?? 0,
      revenuePerSeat: sales.revenuePerSeat ?? 0,
      revenuePerLaborHour: sales.revenuePerLaborHour ?? 0,
      revenuePerSqFt: sales.revenuePerSqFt ?? 0,
      byHour: sales.byHour ?? [],
      byMenuItem: sales.byMenuItem ?? [],
      byCategory: sales.byCategory ?? [],
      byChannel: sales.byChannel ?? [],
      byDaypart: sales.byDaypart ?? [],
      highlights: sales.highlights ?? EMPTY_SALES_HIGHLIGHTS,
      questions: sales.questions ?? [],
    },
    foodCost: {
      inventoryValuation: foodCost.inventoryValuation ?? 0,
      theoreticalFoodCost: foodCost.theoreticalFoodCost ?? 0,
      actualFoodCost: foodCost.actualFoodCost ?? 0,
      wasteCost: foodCost.wasteCost ?? 0,
      spoilageCost: foodCost.spoilageCost ?? 0,
      foodCostPct: foodCost.foodCostPct ?? 0,
      theoreticalFoodCostPct: foodCost.theoreticalFoodCostPct ?? 0,
      variancePct: foodCost.variancePct ?? 0,
      inventoryTurnover: foodCost.inventoryTurnover ?? 0,
      daysOnHand: foodCost.daysOnHand ?? 0,
      inventoryCounts: foodCost.inventoryCounts ?? [],
      recipeCosts: foodCost.recipeCosts ?? [],
      wasteByReason: foodCost.wasteByReason ?? [],
      pricingChanges: foodCost.pricingChanges ?? [],
      vendorComparison: foodCost.vendorComparison ?? [],
      lowStockItems: foodCost.lowStockItems ?? [],
      topCostDrivers: foodCost.topCostDrivers ?? [],
      highlights: foodCost.highlights ?? EMPTY_FOOD_HIGHLIGHTS,
      questions: foodCost.questions ?? [],
    },
    labor: {
      scheduledHours: raw.labor?.scheduledHours ?? 0,
      actualHours: raw.labor?.actualHours ?? 0,
      overtimeHours: raw.labor?.overtimeHours ?? 0,
      laborCost: raw.labor?.laborCost ?? 0,
      laborPct: raw.labor?.laborPct ?? 0,
      salesPerLaborHour: raw.labor?.salesPerLaborHour ?? 0,
      guestsPerLaborHour: raw.labor?.guestsPerLaborHour ?? 0,
      overtimePct: raw.labor?.overtimePct ?? 0,
      laborVarianceHours: raw.labor?.laborVarianceHours ?? 0,
      laborVariancePct: raw.labor?.laborVariancePct ?? 0,
      byPosition: raw.labor?.byPosition ?? [],
      byShift: raw.labor?.byShift ?? [],
      bySalesHour: raw.labor?.bySalesHour ?? [],
      byEmployee: raw.labor?.byEmployee ?? [],
      highlights: raw.labor?.highlights ?? EMPTY_LABOR_HIGHLIGHTS,
      questions: raw.labor?.questions ?? [],
    },
    menuEngineering: {
      items: raw.menuEngineering?.items ?? [],
      stars: raw.menuEngineering?.stars ?? 0,
      plowhorses: raw.menuEngineering?.plowhorses ?? 0,
      puzzles: raw.menuEngineering?.puzzles ?? 0,
      dogs: raw.menuEngineering?.dogs ?? 0,
      totalItemsSold: raw.menuEngineering?.totalItemsSold ?? 0,
      totalContribution: raw.menuEngineering?.totalContribution ?? 0,
      avgPopularityPct: raw.menuEngineering?.avgPopularityPct ?? 0,
      avgMarginPct: raw.menuEngineering?.avgMarginPct ?? 0,
      menuMix: raw.menuEngineering?.menuMix ?? [],
      byQuadrant: raw.menuEngineering?.byQuadrant ?? {
        star: [],
        plowhorse: [],
        puzzle: [],
        dog: [],
      },
      highlights: raw.menuEngineering?.highlights ?? EMPTY_MENU_HIGHLIGHTS,
      questions: raw.menuEngineering?.questions ?? [],
    },
    marketing: {
      totalSpend: raw.marketing?.totalSpend ?? 0,
      campaigns: raw.marketing?.campaigns ?? [],
      couponUsage: raw.marketing?.couponUsage ?? {
        ordersWithCoupon: 0,
        totalDiscount: 0,
        couponRatePct: 0,
        avgDiscount: 0,
      },
      emailPerformance: raw.marketing?.emailPerformance ?? {
        campaigns: 0,
        spend: 0,
        clicks: 0,
        conversions: 0,
        revenue: 0,
        roas: 0,
      },
      socialMedia: raw.marketing?.socialMedia ?? {
        totalFollowers: 0,
        accounts: [],
        totalPostsPublished: 0,
      },
      websiteTraffic: raw.marketing?.websiteTraffic ?? null,
      googleBusiness: raw.marketing?.googleBusiness ?? {
        reviewCount: 0,
        avgRating: 0,
        profileViews30d: 0,
        directionRequests: 0,
      },
      socialEngagement: raw.marketing?.socialEngagement ?? 0,
      newGuests: raw.marketing?.newGuests ?? 0,
      returningGuests: raw.marketing?.returningGuests ?? 0,
      repeatVisitRate: raw.marketing?.repeatVisitRate ?? 0,
      customerAcquisitionCost: raw.marketing?.customerAcquisitionCost ?? 0,
      returnOnAdSpend: raw.marketing?.returnOnAdSpend ?? 0,
      lifetimeValueEstimate: raw.marketing?.lifetimeValueEstimate ?? 0,
      highlights: raw.marketing?.highlights ?? EMPTY_MARKETING_HIGHLIGHTS,
      questions: raw.marketing?.questions ?? [],
    },
    customerExperience: {
      avgRating: raw.customerExperience?.avgRating ?? 0,
      reviewCount: raw.customerExperience?.reviewCount ?? 0,
      starDistribution: raw.customerExperience?.starDistribution ?? [],
      bySource: raw.customerExperience?.bySource ?? [],
      googleReviews: raw.customerExperience?.googleReviews ?? {
        count: 0,
        avgRating: 0,
        unresolved: 0,
        recent: [],
      },
      openTableReviews: raw.customerExperience?.openTableReviews ?? {
        count: 0,
        avgRating: 0,
        unresolved: 0,
        recent: [],
      },
      surveyResults: raw.customerExperience?.surveyResults ?? [],
      complaintCategories: raw.customerExperience?.complaintCategories ?? [],
      resolutionTimes: raw.customerExperience?.resolutionTimes ?? {
        avgDaysToResolve: 0,
        unresolvedAvgDays: 0,
        resolvedCount: 0,
        unresolvedCount: 0,
      },
      sentiment: raw.customerExperience?.sentiment ?? { positive: 0, neutral: 0, negative: 0 },
      complaintsByDaypart: raw.customerExperience?.complaintsByDaypart ?? [],
      unresolvedCount: raw.customerExperience?.unresolvedCount ?? 0,
      recentReviews: raw.customerExperience?.recentReviews ?? [],
      highlights: raw.customerExperience?.highlights ?? EMPTY_CUSTOMER_HIGHLIGHTS,
      questions: raw.customerExperience?.questions ?? [],
    },
    operations: {
      avgTicketTimeMinutes: raw.operations?.avgTicketTimeMinutes ?? 0,
      avgKitchenProductionMinutes: raw.operations?.avgKitchenProductionMinutes ?? 0,
      orderAccuracyPct: raw.operations?.orderAccuracyPct ?? 0,
      voidRatePct: raw.operations?.voidRatePct ?? 0,
      voidTotal: raw.operations?.voidTotal ?? 0,
      discountRatePct: raw.operations?.discountRatePct ?? 0,
      discountTotal: raw.operations?.discountTotal ?? 0,
      compRatePct: raw.operations?.compRatePct ?? 0,
      compTotal: raw.operations?.compTotal ?? 0,
      refundTotal: raw.operations?.refundTotal ?? 0,
      refundRatePct: raw.operations?.refundRatePct ?? 0,
      bottleneckDaypart: raw.operations?.bottleneckDaypart ?? "dinner",
      ticketTimesByDaypart: raw.operations?.ticketTimesByDaypart ?? [],
      ticketTimesByHour: raw.operations?.ticketTimesByHour ?? [],
      highlights: raw.operations?.highlights ?? EMPTY_OPERATIONS_HIGHLIGHTS,
      questions: raw.operations?.questions ?? [],
    },
    purchasing: {
      totalPurchases: raw.purchasing?.totalPurchases ?? 0,
      vendorCount: raw.purchasing?.vendorCount ?? 0,
      invoices: raw.purchasing?.invoices ?? [],
      costInflationPct: raw.purchasing?.costInflationPct ?? 0,
      topVendors: raw.purchasing?.topVendors ?? [],
      highlights: raw.purchasing?.highlights ?? EMPTY_PURCHASING_HIGHLIGHTS,
      questions: raw.purchasing?.questions ?? [],
      draftPurchaseOrders: raw.purchasing?.draftPurchaseOrders ?? [],
      vendorBids: raw.purchasing?.vendorBids ?? [],
    },
    forecasting: {
      salesForecast7d: raw.forecasting?.salesForecast7d ?? [],
      laborHoursForecast7d: raw.forecasting?.laborHoursForecast7d ?? [],
      inventoryRecommendations: raw.forecasting?.inventoryRecommendations ?? [],
      cateringDemandForecast7d: raw.forecasting?.cateringDemandForecast7d ?? [],
      seasonalTrends: raw.forecasting?.seasonalTrends ?? [],
      seasonalNote: raw.forecasting?.seasonalNote ?? "",
      highlights: raw.forecasting?.highlights ?? EMPTY_FORECASTING_HIGHLIGHTS,
      questions: raw.forecasting?.questions ?? [],
    },
    profitability: {
      grossProfit: raw.profitability?.grossProfit ?? 0,
      netProfitEstimate: raw.profitability?.netProfitEstimate ?? 0,
      profitMarginPct: raw.profitability?.profitMarginPct ?? 0,
      byMenuItem: raw.profitability?.byMenuItem ?? [],
      byCategory: raw.profitability?.byCategory ?? [],
      byEmployee: raw.profitability?.byEmployee ?? [],
      byShift: raw.profitability?.byShift ?? [],
      byDaypart: raw.profitability?.byDaypart ?? [],
      byHour: raw.profitability?.byHour ?? [],
      byDay: raw.profitability?.byDay ?? [],
      byLocation: raw.profitability?.byLocation ?? [],
      byChannel: raw.profitability?.byChannel ?? [],
      byDeliveryProvider: raw.profitability?.byDeliveryProvider ?? [],
      byCampaign: raw.profitability?.byCampaign ?? [],
      highlights: raw.profitability?.highlights ?? EMPTY_PROFITABILITY_HIGHLIGHTS,
      questions: raw.profitability?.questions ?? [],
    },
    externalFactors: {
      factors: raw.externalFactors?.factors ?? [],
      patterns: raw.externalFactors?.patterns ?? [],
      learnedPatterns: raw.externalFactors?.learnedPatterns ?? [],
      byCategory: raw.externalFactors?.byCategory ?? [],
      weatherForecast: raw.externalFactors?.weatherForecast ?? [],
      weatherSource: raw.externalFactors?.weatherSource ?? "",
      weatherGeo: raw.externalFactors?.weatherGeo ?? null,
      highlights: raw.externalFactors?.highlights ?? EMPTY_EXTERNAL_HIGHLIGHTS,
      questions: raw.externalFactors?.questions ?? DEFAULT_EXTERNAL_QUESTIONS,
    },
    aiInsights: raw.aiInsights ?? [],
    coverage: raw.coverage ?? { sections: [] },
  };
}
