import { NextRequest, NextResponse } from "next/server";
import { getLocationIdFromRequest } from "@/lib/location";
import { requirePermission } from "@/lib/api-auth";
import {
  getKitchenCostingDashboard,
  recalculateAllRecipeCosts,
} from "@/lib/kitchen/dynamic-costing";
import { generatePrepList } from "@/lib/kitchen/prep-list";
import { prisma } from "@/lib/prisma";
import { parseAllergens, ALLERGEN_LABELS } from "@/lib/kitchen/allergens";

export async function GET(request: NextRequest) {
  const { error } = await requirePermission(request, "manage_menu");
  if (error) return error;

  const locationId = await getLocationIdFromRequest(request);
  const [costing, prepList, allergenInsights] = await Promise.all([
    getKitchenCostingDashboard(locationId),
    generatePrepList(locationId),
    prisma.businessInsight.findMany({
      where: {
        locationId,
        resolved: false,
        category: "MENU",
        title: { contains: "Allergen" },
      },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
  ]);

  return NextResponse.json({
    costing,
    prepList,
    allergenAlerts: allergenInsights,
    allergenLabels: ALLERGEN_LABELS,
  });
}
