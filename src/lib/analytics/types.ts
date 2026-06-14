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

export interface CustomerExperienceHighlights {
  satisfactionHurts: Array<{ issue: string; count: number; avgRating: number }>;
  complaintHotspots: Array<{
    label: string;
    type: "daypart";
    count: number;
    topCategory: string | null;
  }>;
  sentimentSummary: {
    positive: number;
    neutral: number;
    negative: number;
    overall: "positive" | "mixed" | "negative";
  };
}

export interface CustomerExperienceAnalytics {
  avgRating: number;
  reviewCount: number;
  starDistribution: Array<{ stars: number; count: number; pct: number }>;
  bySource: Array<{ source: string; count: number; avgRating: number }>;
  googleReviews: {
    count: number;
    avgRating: number;
    unresolved: number;
    recent: Array<{ rating: number; comment: string | null; date: string }>;
  };
  openTableReviews: {
    count: number;
    avgRating: number;
    unresolved: number;
    recent: Array<{ rating: number; comment: string | null; date: string }>;
  };
  surveyResults: Array<{
    category: string;
    responses: number;
    avgScore: number;
    satisfiedPct: number;
  }>;
  complaintCategories: Array<{ category: string; count: number }>;
  resolutionTimes: {
    avgDaysToResolve: number;
    unresolvedAvgDays: number;
    resolvedCount: number;
    unresolvedCount: number;
  };
  sentiment: { positive: number; neutral: number; negative: number };
  complaintsByDaypart: Array<{
    daypart: string;
    negativeCount: number;
    avgRating: number;
    topCategory: string | null;
  }>;
  unresolvedCount: number;
  recentReviews: Array<{ source: string; rating: number; comment: string | null; date: string; category: string | null }>;
  highlights: CustomerExperienceHighlights;
  questions: string[];
}

export interface OperationsHighlights {
  bottlenecks: Array<{
    label: string;
    type: "daypart" | "hour";
    avgTicketMinutes: number;
    orders: number;
  }>;
  ticketTimeImpact: {
    status: "hurting" | "manageable" | "no_data";
    reason: string;
    slowOrderPct: number;
    avgTicketTimeMinutes: number;
  };
}

export interface OperationsAnalytics {
  avgTicketTimeMinutes: number;
  avgKitchenProductionMinutes: number;
  orderAccuracyPct: number;
  voidRatePct: number;
  voidTotal: number;
  discountRatePct: number;
  discountTotal: number;
  compRatePct: number;
  compTotal: number;
  refundTotal: number;
  refundRatePct: number;
  bottleneckDaypart: string;
  ticketTimesByDaypart: Array<{ daypart: string; avgMinutes: number; orders: number }>;
  ticketTimesByHour: Array<{ hour: number; label: string; avgMinutes: number; orders: number }>;
  highlights: OperationsHighlights;
  questions: string[];
}

export interface PurchasingHighlights {
  costIncreaseSuppliers: Array<{ vendor: string; changePct: number; spend: number }>;
  marketRateStatus: {
    status: "above" | "at" | "below" | "unknown";
    reason: string;
  };
}

export interface PurchasingAnalytics {
  totalPurchases: number;
  vendorCount: number;
  invoices: Array<{ vendor: string; amount: number; priceChangePct: number }>;
  costInflationPct: number;
  topVendors: Array<{ vendor: string; spend: number; orders: number }>;
  highlights: PurchasingHighlights;
  questions: string[];
}

export interface ForecastingHighlights {
  staffNeededNextFriday: { hours: number; predictedSales: number; date: string };
  inventoryOrderDate: string;
  inventoryOrderTomorrow: Array<{ name: string; quantity: number; unit: string; onHand: number }>;
  cateringDemandNext7d: { orders: number; sales: number; trend: "up" | "down" | "stable" };
  seasonalTrend: { pattern: string; insight: string; peakDay: string; liftPct: number };
}

export interface ForecastingAnalytics {
  salesForecast7d: Array<{ date: string; predicted: number }>;
  laborHoursForecast7d: Array<{ date: string; hours: number }>;
  inventoryRecommendations: Array<{ name: string; suggestedOrder: number; unit: string }>;
  cateringDemandForecast7d: Array<{ date: string; predictedOrders: number; predictedSales: number }>;
  seasonalTrends: Array<{ label: string; insight: string; impactPct: number }>;
  seasonalNote: string;
  highlights: ForecastingHighlights;
  questions: string[];
}

export type ProfitDriverType =
  | "item"
  | "category"
  | "employee"
  | "shift"
  | "daypart"
  | "hour"
  | "day"
  | "channel"
  | "location"
  | "delivery"
  | "campaign";

export interface ProfitabilityHighlights {
  profitLeaks: Array<{ area: string; amount: number; reason: string }>;
  marginDrivers: Array<{ name: string; type: ProfitDriverType; profit: number }>;
  topProfitItem: { name: string; profit: number } | null;
  topProfitHour: { hour: number; label: string; profit: number } | null;
  topProfitDay: { date: string; profit: number } | null;
  topProfitEmployee: { name: string; profit: number } | null;
  topProfitChannel: { channel: string; profit: number } | null;
  topCampaign: { name: string; profit: number } | null;
  lowestProfitShift: { shift: string; profit: number } | null;
}

export interface ProfitabilityAnalytics {
  grossProfit: number;
  netProfitEstimate: number;
  profitMarginPct: number;
  byMenuItem: Array<{ name: string; profit: number; marginPct: number; sales: number }>;
  byCategory: Array<{ category: string; profit: number; sales: number; marginPct: number }>;
  byEmployee: Array<{ name: string; role: string; profit: number; sales: number; marginPct: number }>;
  byShift: Array<{ shift: Daypart; profit: number; sales: number; laborCost: number; marginPct: number }>;
  byDaypart: Array<{ daypart: Daypart; profit: number; sales: number; marginPct: number }>;
  byHour: Array<{ hour: number; label: string; profit: number; sales: number; orders: number }>;
  byDay: Array<{ date: string; profit: number; sales: number }>;
  byLocation: Array<{ locationId: string; name: string; profit: number; sales: number; marginPct: number }>;
  byChannel: Array<{ channel: string; profit: number; sales: number; marginPct: number }>;
  byDeliveryProvider: Array<{ provider: string; profit: number; sales: number; orders: number; marginPct: number }>;
  byCampaign: Array<{ name: string; channel: string; profit: number; spend: number; revenue: number; roiPct: number }>;
  highlights: ProfitabilityHighlights;
  questions: string[];
}

export type ExternalFactorCategory =
  | "weather"
  | "event"
  | "holiday"
  | "sports"
  | "tourism"
  | "school";

export interface LearnedPattern {
  category: ExternalFactorCategory;
  pattern: string;
  metric: "sales" | "delivery" | "dine-in" | "orders" | "guests";
  impactPct: number;
  confidence: "low" | "medium" | "high";
  insight: string;
  sampleSize: number;
}

export interface WeatherForecastDay {
  date: string;
  condition: string;
  tempHigh: number;
  tempLow: number;
  precipitationPct: number;
  isRainy: boolean;
}

export interface ExternalFactorsHighlights {
  weatherImpact: {
    avgImpactPct: number;
    insight: string;
    deliveryShiftPct: number | null;
  } | null;
  topEvents: Array<{ description: string; impactPct: number; category: ExternalFactorCategory }>;
  learnedPatterns: LearnedPattern[];
  upcomingForecast: WeatherForecastDay[];
  tourismLevel: "low" | "moderate" | "high" | null;
  schoolScheduleNote: string | null;
  categoryCoverage: Array<{
    category: ExternalFactorCategory;
    label: string;
    tracked: boolean;
    learned: boolean;
    avgImpactPct: number | null;
  }>;
}

export interface ExternalFactorsAnalytics {
  factors: Array<{
    date: string;
    factorType: string;
    category: ExternalFactorCategory;
    description: string;
    impactPct: number;
  }>;
  patterns: Array<{ pattern: string; insight: string; category?: ExternalFactorCategory; confidence?: string; impactPct?: number }>;
  learnedPatterns: LearnedPattern[];
  byCategory: Array<{ category: ExternalFactorCategory; count: number; avgImpactPct: number }>;
  weatherForecast: WeatherForecastDay[];
  weatherSource: string;
  weatherGeo: string | null;
  highlights: ExternalFactorsHighlights;
  questions: string[];
}
