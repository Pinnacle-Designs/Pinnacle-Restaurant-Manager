import { prisma } from "./prisma";

/** Global demo data — admin panel, pitch requests (not location-scoped). */
export async function seedPlatformDemos() {
  await seedPitchInquiries();
  await seedPlatformAdminUser();
}

async function seedPitchInquiries() {
  const count = await prisma.activityLog.count({ where: { entity: "pitch_deck" } });
  if (count > 0) return;

  const inquiries = [
    {
      name: "Jordan Hale",
      email: "jhale@apexfoodgroup.com",
      company: "Apex Food Group",
      interest: "licensing",
      message: "Interested in white-label POS + analytics for our 40-unit franchise group.",
    },
    {
      name: "Priya Mehta",
      email: "priya@venturekitchen.vc",
      company: "Venture Kitchen",
      interest: "investing",
      message: "Seed-stage fund focused on restaurant tech — would love the private deck.",
    },
  ];

  for (const row of inquiries) {
    await prisma.activityLog.create({
      data: {
        locationId: null,
        action: "REQUEST",
        entity: "pitch_deck",
        details: JSON.stringify(row),
      },
    });
  }
}

async function seedPlatformAdminUser() {
  await prisma.user.updateMany({
    where: { email: "owner@pinnacle.com" },
    data: { isPlatformAdmin: true },
  });
}
