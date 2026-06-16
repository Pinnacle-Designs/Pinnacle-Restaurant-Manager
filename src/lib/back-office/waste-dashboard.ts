import { subDays } from "date-fns";
import { prisma } from "@/lib/prisma";

export const WASTE_CATEGORIES = ["DROPPED", "BURNT", "EXPIRED", "TRIM", "SPOILAGE", "OTHER"] as const;

export interface WasteDashboard {
  periodDays: number;
  totalCost: number;
  totalQuantity: number;
  byCategory: { category: string; cost: number; quantity: number; count: number }[];
  byEmployee: { name: string; cost: number; count: number }[];
  byShift: { shiftLabel: string; cost: number; count: number }[];
  byReason: { reason: string; cost: number; quantity: number }[];
  recent: {
    id: string;
    itemName: string;
    quantity: number;
    unit: string;
    cost: number;
    reason: string;
    category: string | null;
    employee: string | null;
    shift: string | null;
    date: string;
  }[];
}

export async function computeWasteDashboard(
  locationId: string,
  periodDays = 30
): Promise<WasteDashboard> {
  const since = subDays(new Date(), periodDays);

  const waste = await prisma.inventoryWaste.findMany({
    where: { locationId, date: { gte: since } },
    include: {
      recordedByStaff: true,
      shift: { include: { staffMember: true } },
    },
    orderBy: { date: "desc" },
  });

  const byCategory = new Map<string, { cost: number; quantity: number; count: number }>();
  const byEmployee = new Map<string, { cost: number; count: number }>();
  const byShift = new Map<string, { cost: number; count: number }>();
  const byReason = new Map<string, { cost: number; quantity: number }>();

  for (const w of waste) {
    const cat = w.wasteCategory ?? inferCategory(w.reason);
    const catEntry = byCategory.get(cat) ?? { cost: 0, quantity: 0, count: 0 };
    catEntry.cost += w.cost;
    catEntry.quantity += w.quantity;
    catEntry.count += 1;
    byCategory.set(cat, catEntry);

    const empName = w.recordedByStaff?.name ?? w.recordedBy ?? "Unassigned";
    const empEntry = byEmployee.get(empName) ?? { cost: 0, count: 0 };
    empEntry.cost += w.cost;
    empEntry.count += 1;
    byEmployee.set(empName, empEntry);

    const shiftLabel = w.shift
      ? `${w.shift.date.toISOString().split("T")[0]} ${w.shift.startTime}–${w.shift.endTime}${w.shift.staffMember ? ` (${w.shift.staffMember.name})` : ""}`
      : "No shift linked";
    const shiftEntry = byShift.get(shiftLabel) ?? { cost: 0, count: 0 };
    shiftEntry.cost += w.cost;
    shiftEntry.count += 1;
    byShift.set(shiftLabel, shiftEntry);

    const reasonEntry = byReason.get(w.reason) ?? { cost: 0, quantity: 0 };
    reasonEntry.cost += w.cost;
    reasonEntry.quantity += w.quantity;
    byReason.set(w.reason, reasonEntry);
  }

  return {
    periodDays,
    totalCost: waste.reduce((s, w) => s + w.cost, 0),
    totalQuantity: waste.reduce((s, w) => s + w.quantity, 0),
    byCategory: [...byCategory.entries()]
      .map(([category, v]) => ({ category, ...v }))
      .sort((a, b) => b.cost - a.cost),
    byEmployee: [...byEmployee.entries()]
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.cost - a.cost),
    byShift: [...byShift.entries()]
      .map(([shiftLabel, v]) => ({ shiftLabel, ...v }))
      .sort((a, b) => b.cost - a.cost)
      .slice(0, 10),
    byReason: [...byReason.entries()]
      .map(([reason, v]) => ({ reason, ...v }))
      .sort((a, b) => b.cost - a.cost),
    recent: waste.slice(0, 20).map((w) => ({
      id: w.id,
      itemName: w.itemName,
      quantity: w.quantity,
      unit: w.unit,
      cost: w.cost,
      reason: w.reason,
      category: w.wasteCategory ?? inferCategory(w.reason),
      employee: w.recordedByStaff?.name ?? w.recordedBy ?? null,
      shift: w.shift
        ? `${w.shift.startTime}–${w.shift.endTime}`
        : null,
      date: w.date.toISOString(),
    })),
  };
}

function inferCategory(reason: string): string {
  const r = reason.toLowerCase();
  if (r.includes("drop")) return "DROPPED";
  if (r.includes("burnt") || r.includes("burn")) return "BURNT";
  if (r.includes("expir") || r.includes("spoil")) return "EXPIRED";
  if (r.includes("trim")) return "TRIM";
  return "OTHER";
}
