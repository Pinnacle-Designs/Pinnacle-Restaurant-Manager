import { subDays } from "date-fns";
import { prisma } from "@/lib/prisma";

export async function seedBackOfficeSample(locationId: string) {
  const existing = await prisma.inventoryWaste.count({
    where: { locationId, wasteCategory: { not: null } },
  });
  if (existing > 3) return;

  const [staff, inventory, shifts] = await Promise.all([
    prisma.staffMember.findMany({ where: { locationId, active: true }, take: 4 }),
    prisma.inventoryItem.findMany({ where: { locationId }, take: 8 }),
    prisma.shift.findMany({
      where: { locationId, date: { gte: subDays(new Date(), 14) } },
      take: 6,
      include: { staffMember: true },
    }),
  ]);

  const samples = [
    { reason: "Dropped tray — brisket slices", category: "DROPPED", qty: 2.5, item: "Beef brisket" },
    { reason: "Burnt ends — overcooked batch", category: "BURNT", qty: 3, item: "Beef brisket" },
    { reason: "Expired — past use-by date", category: "EXPIRED", qty: 4, item: "Cabbage" },
    { reason: "Trim waste — brisket prep", category: "TRIM", qty: 6, item: "Beef brisket" },
    { reason: "Spoilage — walk-in temp fluctuation", category: "SPOILAGE", qty: 2, item: "Pork shoulder" },
    { reason: "Dropped — mac pan", category: "DROPPED", qty: 1.5, item: "Elbow macaroni" },
  ];

  for (const [idx, sample] of samples.entries()) {
    const inv = inventory.find((i) => i.name === sample.item) ?? inventory[idx % inventory.length]!;
    const staffMember = staff[idx % staff.length];
    const shift = shifts[idx % Math.max(shifts.length, 1)];

    await prisma.inventoryWaste.create({
      data: {
        locationId,
        inventoryItemId: inv.id,
        itemName: inv.name,
        quantity: sample.qty,
        unit: inv.unit,
        cost: sample.qty * inv.costPerUnit,
        reason: sample.reason,
        wasteCategory: sample.category,
        recordedByStaffId: staffMember?.id ?? null,
        recordedBy: staffMember?.name ?? "Kitchen lead",
        shiftId: shift?.id ?? null,
        date: subDays(new Date(), idx + 1),
      },
    });
  }
}
