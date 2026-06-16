import { prisma } from "@/lib/prisma";

export interface CatchWeightAlert {
  type: "catch_weight_short" | "catch_weight_missing" | "heavy_box";
  itemName: string;
  description: string;
  billedWeight: number | null;
  receivedWeight: number | null;
  unit: string;
  varianceLbs: number;
  variancePct: number;
  exposureAmount: number;
  severity: "HIGH" | "MEDIUM";
}

const CASE_UNITS = new Set(["case", "cs", "csa", "box", "bx"]);

export function isCaseUnit(unit: string) {
  return CASE_UNITS.has(unit.toLowerCase().trim());
}

export async function isCatchWeightInventoryItem(inventoryItemId: string | null | undefined) {
  if (!inventoryItemId) return false;
  const item = await prisma.inventoryItem.findUnique({
    where: { id: inventoryItemId },
    select: { countByWeight: true, unit: true, name: true },
  });
  if (!item) return false;
  return (
    item.countByWeight ||
    item.unit.toLowerCase() === "lbs" ||
    /brisket|fish|salmon|tuna|pork|beef|meat|primal/i.test(item.name)
  );
}

export function auditCatchWeight(params: {
  invoiceLines: Array<{
    description: string;
    qty: number;
    unit: string;
    unitPrice: number;
    lineTotal: number;
    inventoryItemId?: string | null;
    catchWeightBilled?: number | null;
    catchWeightUnit?: string | null;
  }>;
  receiptLines?: Array<{
    description: string;
    qtyReceived: number;
    unit: string;
    unitCost: number;
    inventoryItemId?: string | null;
    catchWeightReceived?: number | null;
    catchWeightBilled?: number | null;
    catchWeightUnit?: string | null;
  }>;
}): CatchWeightAlert[] {
  const alerts: CatchWeightAlert[] = [];

  for (const inv of params.invoiceLines) {
    const billedWeight =
      inv.catchWeightBilled ??
      (inv.unit.toLowerCase() === "lbs" || inv.unit.toLowerCase() === "lb" ? inv.qty : null);

    const rec = params.receiptLines?.find(
      (r) =>
        (inv.inventoryItemId && r.inventoryItemId === inv.inventoryItemId) ||
        r.description.toLowerCase() === inv.description.toLowerCase()
    );

    const receivedWeight =
      rec?.catchWeightReceived ??
      (rec && (rec.unit.toLowerCase() === "lbs" || rec.unit.toLowerCase() === "lb")
        ? rec.qtyReceived
        : null);

    const weightUnit = inv.catchWeightUnit ?? rec?.catchWeightUnit ?? "lbs";
    const isCatchWeightLine =
      billedWeight != null ||
      receivedWeight != null ||
      isCaseUnit(inv.unit) ||
      (rec && isCaseUnit(rec.unit));

    if (!isCatchWeightLine) continue;

    if (billedWeight != null && receivedWeight == null) {
      alerts.push({
        type: "catch_weight_missing",
        itemName: inv.description,
        description: `${inv.description}: invoice bills ${billedWeight} ${weightUnit} but receiving log has no catch weight — verify you are not paying for box weight.`,
        billedWeight,
        receivedWeight: null,
        unit: weightUnit,
        varianceLbs: billedWeight,
        variancePct: 100,
        exposureAmount: inv.lineTotal,
        severity: "MEDIUM",
      });
      continue;
    }

    if (billedWeight != null && receivedWeight != null && receivedWeight + 0.05 < billedWeight) {
      const varianceLbs = billedWeight - receivedWeight;
      const variancePct = billedWeight > 0 ? (varianceLbs / billedWeight) * 100 : 0;
      const perLb = billedWeight > 0 ? inv.lineTotal / billedWeight : inv.unitPrice;
      const exposureAmount = Math.round(varianceLbs * perLb * 100) / 100;

      alerts.push({
        type: variancePct > 8 ? "heavy_box" : "catch_weight_short",
        itemName: inv.description,
        description:
          variancePct > 8
            ? `${inv.description}: billed ${billedWeight} ${weightUnit} but only ${receivedWeight} ${weightUnit} received — possible heavy-box overcharge (+${variancePct.toFixed(0)}%).`
            : `${inv.description}: catch weight short ${varianceLbs.toFixed(1)} ${weightUnit} (billed ${billedWeight}, received ${receivedWeight}).`,
        billedWeight,
        receivedWeight,
        unit: weightUnit,
        varianceLbs: Math.round(varianceLbs * 100) / 100,
        variancePct: Math.round(variancePct * 10) / 10,
        exposureAmount,
        severity: variancePct > 5 || exposureAmount > 25 ? "HIGH" : "MEDIUM",
      });
    }
  }

  return alerts;
}

export async function persistCatchWeightInsights(
  locationId: string,
  vendor: string,
  alerts: CatchWeightAlert[]
) {
  for (const alert of alerts) {
    const existing = await prisma.businessInsight.findFirst({
      where: {
        locationId,
        resolved: false,
        title: { contains: alert.itemName },
        category: "INVENTORY",
      },
    });
    if (existing) continue;

    await prisma.businessInsight.create({
      data: {
        locationId,
        title: `Catch weight: ${alert.itemName}`,
        description: alert.description,
        category: "INVENTORY",
        severity: alert.severity === "HIGH" ? "HIGH" : "MEDIUM",
        actionable: `Request credit from ${vendor} for ${alert.varianceLbs} ${alert.unit} (${formatMoney(alert.exposureAmount)})`,
        dataSnapshot: JSON.stringify({ vendor, ...alert }),
      },
    });
  }
}

function formatMoney(n: number) {
  return `$${n.toFixed(2)}`;
}
