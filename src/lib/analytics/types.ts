export type Daypart = "breakfast" | "lunch" | "dinner" | "late";

export type MenuQuadrant = "star" | "plowhorse" | "puzzle" | "dog";

export interface AnalyticsPayload {
  generatedAt: string;
  periodDays: number;
  executive: ExecutiveSummary;
  sales: SalesAnalytics;
  foodCost: FoodCostAnalytics;
  labor: LaborAnalytics;
  menuEngineering: MenuEngineeringAnalytics;
  marketing: MarketingAnalytics;
  customerExperience: CustomerExperienceAnalytics;
  operations: OperationsAnalytics;
  purchasing: PurchasingAnalytics;
  forecasting: ForecastingAnalytics;
  profitability: ProfitabilityAnalytics;
  externalFactors: ExternalFactorsAnalytics;
  aiInsights: AnalyticsInsight[];
  coverage: AnalyticsCoverage;
}

export interface AnalyticsInsight {
  title: string;
  description: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  category: string;
}

export interface AnalyticsCoverage {
  sections: Array<{ id: string; label: string; covered: boolean; note?: string }>;
}

export interface ExecutiveSummary {
  yesterday: {
    sales: number;
    netSales: number;
    foodCostPct: number;
    laborPct: number;
    primeCostPct: number;
    profitEstimate: number;
    guestCount: number;
  };
  last7Days: {
    salesTrend: Array<{ date: string; sales: number }>;
    profitTrend: Array<{ date: string; profit: number }>;
    reviewTrend: Array<{ date: string; avgRating: number }>;
  };
  alerts: Array<{ type: string; message: string; severity: string }>;
}

export interface SalesHighlights {
  topSellingItem: { name: string; sales: number; quantity: number } | null;
  busiestDaypart: { daypart: Daypart; sales: number; orders: number } | null;
  busiestHour: { hour: number; sales: number; orders: number } | null;
  mostProfitableChannel: { channel: string; profit: number; marginPct: number; orders: number } | null;
  highestVolumeChannel: { channel: string; sales: number; orders: number } | null;
}

export interface SalesAnalytics {
  totalSales: number;
  netSales: number;
  byDaypart: Array<{ daypart: Daypart; sales: number; orders: number }>;
  byHour: Array<{ hour: number; sales: number; orders: number }>;
  byMenuItem: Array<{ name: string; sales: number; quantity: number }>;
  byCategory: Array<{ category: string; sales: number; quantity: number }>;
  averageCheck: number;
  averageSpendPerGuest: number;
  guestCount: number;
  revenuePerSeat: number;
  revenuePerLaborHour: number;
  revenuePerSqFt: number;
  byChannel: Array<{ channel: string; sales: number; profit: number; orders: number; marginPct: number }>;
  highlights: SalesHighlights;
  questions: string[];
}

export interface FoodCostHighlights {
  foodCostPct: number;
  variancePct: number;
  inventoryTurnover: number;
  daysOnHand: number;
  topWasteReason: string | null;
  vendorWithHighestIncrease: { vendor: string; changePct: number } | null;
  cheaperVendorOpportunity: {
    itemName: string;
    currentVendor: string;
    alternativeVendor: string;
    savingsPct: number;
  } | null;
  /** Answers: Where is product disappearing? */
  productDisappearing: {
    primaryCause: string;
    wasteCost: number;
    spoilageCost: number;
    varianceGapPct: number;
  };
  /** Answers: Which items are driving food cost increases? */
  costIncreaseDrivers: Array<{ name: string; cost: number; changePct: number }>;
  /** Answers: Are recipes being followed? */
  recipeCompliance: {
    status: "on_track" | "drift" | "favorable";
    theoreticalPct: number;
    actualPct: number;
    variancePct: number;
    topDriftItem: string | null;
  };
}

export interface FoodCostAnalytics {
  inventoryValuation: number;
  theoreticalFoodCost: number;
  actualFoodCost: number;
  wasteCost: number;
  spoilageCost: number;
  foodCostPct: number;
  theoreticalFoodCostPct: number;
  variancePct: number;
  inventoryTurnover: number;
  daysOnHand: number;
  inventoryCounts: Array<{
    name: string;
    quantity: number;
    unit: string;
    costPerUnit: number;
    valuation: number;
    supplier: string | null;
    portionSize: number | null;
    portionCost: number | null;
    yieldPct: number;
  }>;
  recipeCosts: Array<{
    name: string;
    category: string;
    price: number;
    recipeCost: number;
    recipeCostPct: number;
  }>;
  wasteByReason: Array<{ reason: string; cost: number; quantity: number }>;
  pricingChanges: Array<{
    vendor: string;
    category: string;
    latestChangePct: number;
    trend: Array<{ date: string; amount?: number; unitPrice?: number; changePct: number }>;
  }>;
  vendorComparison: Array<{
    itemName: string;
    category: string;
    currentVendor: string | null;
    currentPrice: number;
    cheapestVendor: string;
    cheapestPrice: number;
    potentialSavingsPct: number;
    vendors: Array<{ vendor: string; unitPrice: number; unit: string; isCurrent: boolean }>;
  }>;
  lowStockItems: Array<{ name: string; quantity: number; minQuantity: number }>;
  topCostDrivers: Array<{ name: string; cost: number; changePct: number }>;
  highlights: FoodCostHighlights;
  questions: string[];
}

export interface LaborHighlights {
  staffingStatus: "overstaffed" | "understaffed" | "balanced";
  staffingReason: string;
  inefficientShifts: Array<{ label: string; salesPerLaborHour: number; laborPct: number }>;
  topPerformers: Array<{
    name: string;
    role: string;
    salesPerLaborHour: number;
    guestsPerLaborHour: number;
  }>;
}

export interface LaborAnalytics {
  scheduledHours: number;
  actualHours: number;
  overtimeHours: number;
  laborCost: number;
  laborPct: number;
  salesPerLaborHour: number;
  guestsPerLaborHour: number;
  overtimePct: number;
  laborVarianceHours: number;
  laborVariancePct: number;
  byPosition: Array<{ role: string; hours: number; cost: number }>;
  byShift: Array<{
    label: string;
    hours: number;
    laborCost: number;
    sales: number;
    salesPerLaborHour: number;
    laborPct: number;
  }>;
  bySalesHour: Array<{
    hour: number;
    label: string;
    laborHours: number;
    laborCost: number;
    sales: number;
    salesPerLaborHour: number;
  }>;
  byEmployee: Array<{
    name: string;
    role: string;
    scheduledHours: number;
    actualHours: number;
    laborCost: number;
    salesAttributed: number;
    salesPerLaborHour: number;
    guestsPerLaborHour: number;
  }>;
  highlights: LaborHighlights;
  questions: string[];
}

export interface MenuEngineeringHighlights {
  promoteItems: Array<{
    name: string;
    quadrant: MenuQuadrant;
    marginPct: number;
    popularityPct: number;
    quantitySold: number;
  }>;
  repriceItems: Array<{
    name: string;
    price: number;
    marginPct: number;
    popularityPct: number;
    quantitySold: number;
  }>;
  removeItems: Array<{
    name: string;
    marginPct: number;
    popularityPct: number;
    quantitySold: number;
    contribution: number;
  }>;
  topContributor: { name: string; contribution: number } | null;
}

export interface MenuEngineeringItem {
  id: string;
  name: string;
  category: string;
  price: number;
  recipeCost: number;
  margin: number;
  marginPct: number;
  quantitySold: number;
  popularityPct: number;
  contribution: number;
  quadrant: MenuQuadrant;
}

export interface MenuEngineeringAnalytics {
  items: MenuEngineeringItem[];
  stars: number;
  plowhorses: number;
  puzzles: number;
  dogs: number;
  totalItemsSold: number;
  totalContribution: number;
  avgPopularityPct: number;
  avgMarginPct: number;
  menuMix: Array<{
    category: string;
    sales: number;
    quantity: number;
    mixPct: number;
    contribution: number;
  }>;
  byQuadrant: {
    star: MenuEngineeringItem[];
    plowhorse: MenuEngineeringItem[];
    puzzle: MenuEngineeringItem[];
    dog: MenuEngineeringItem[];
  };
  highlights: MenuEngineeringHighlights;
  questions: string[];
}

export interface MarketingHighlights {
  salesGenerating: {
    status: "yes" | "weak" | "no_data";
    reason: string;
    attributedRevenue: number;
    returnOnAdSpend: number;
  };
  profitableChannels: Array<{
    channel: string;
    profit: number;
    marginPct: number;
    orders: number;
    marketingSpend: number;
    roas: number;
  }>;
}

export interface MarketingAnalytics {
  totalSpend: number;
  campaigns: Array<{
    name: string;
    channel: string;
    spend: number;
    impressions: number;
    clicks: number;
    conversions: number;
    revenue: number;
    roas: number;
  }>;
  couponUsage: {
    ordersWithCoupon: number;
    totalDiscount: number;
    couponRatePct: number;
    avgDiscount: number;
  };
  emailPerformance: {
    campaigns: number;
    spend: number;
    clicks: number;
    conversions: number;
    revenue: number;
    roas: number;
  };
  socialMedia: {
    totalFollowers: number;
    accounts: Array<{ platform: string; followers: number; postsPublished: number }>;
    totalPostsPublished: number;
  };
  websiteTraffic: {
    connected: boolean;
    url: string;
    visitors30d: number;
    pageViews30d: number;
    sessions30d: number;
    bounceRate: number;
    topReferrers: Array<{ source: string; pct: number }>;
  } | null;
  googleBusiness: {
    reviewCount: number;
    avgRating: number;
    profileViews30d: number;
    directionRequests: number;
  };
  socialEngagement: number;
  newGuests: number;
  returningGuests: number;
  repeatVisitRate: number;
  customerAcquisitionCost: number;
  returnOnAdSpend: number;
  lifetimeValueEstimate: number;
  highlights: MarketingHighlights;
  questions: string[];
}

export interface CustomerExperienceAnalytics {
  avgRating: number;
  reviewCount: number;
  bySource: Array<{ source: string; count: number; avgRating: number }>;
  complaintCategories: Array<{ category: string; count: number }>;
  unresolvedCount: number;
  recentReviews: Array<{ source: string; rating: number; comment: string | null; date: string }>;
  questions: string[];
}

export interface OperationsAnalytics {
  avgTicketTimeMinutes: number;
  orderAccuracyPct: number;
  voidRatePct: number;
  discountRatePct: number;
  compRatePct: number;
  refundTotal: number;
  bottleneckDaypart: string;
  questions: string[];
}

export interface PurchasingAnalytics {
  totalPurchases: number;
  vendorCount: number;
  invoices: Array<{ vendor: string; amount: number; priceChangePct: number }>;
  costInflationPct: number;
  topVendors: Array<{ vendor: string; spend: number; orders: number }>;
  questions: string[];
}

export interface ForecastingAnalytics {
  salesForecast7d: Array<{ date: string; predicted: number }>;
  laborHoursForecast7d: Array<{ date: string; hours: number }>;
  inventoryRecommendations: Array<{ name: string; suggestedOrder: number; unit: string }>;
  seasonalNote: string;
  questions: string[];
}

export interface ProfitabilityAnalytics {
  grossProfit: number;
  netProfitEstimate: number;
  profitMarginPct: number;
  byMenuItem: Array<{ name: string; profit: number; marginPct: number }>;
  byCategory: Array<{ category: string; profit: number }>;
  byDaypart: Array<{ daypart: Daypart; profit: number }>;
  byChannel: Array<{ channel: string; profit: number }>;
  byDay: Array<{ date: string; profit: number }>;
  questions: string[];
}

export interface ExternalFactorsAnalytics {
  factors: Array<{
    date: string;
    factorType: string;
    description: string;
    impactPct: number;
  }>;
  patterns: Array<{ pattern: string; insight: string }>;
  questions: string[];
}
