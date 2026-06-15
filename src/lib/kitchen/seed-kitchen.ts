import { prisma } from "@/lib/prisma";
import { ensureKitchenStations } from "@/lib/kitchen/stations";

export async function seedKitchenSample(locationId: string) {
  const stations = await ensureKitchenStations(locationId);
  const bySlug = Object.fromEntries(stations.map((s) => [s.slug, s]));

  let ribeye = await prisma.menuItem.findFirst({ where: { locationId, name: "Ribeye Steak" } });
  if (ribeye && !ribeye.kitchenStationId) {
    await prisma.menuItem.update({
      where: { id: ribeye.id },
      data: { kitchenStationId: bySlug.grill?.id, defaultCourse: "MAIN" },
    });
  }

  let shake = await prisma.menuItem.findFirst({ where: { locationId, name: "Chocolate Shake" } });
  if (!shake) {
    shake = await prisma.menuItem.create({
      data: {
        locationId,
        name: "Chocolate Shake",
        description: "Hand-spun",
        price: 6.99,
        category: "Beverages",
        kitchenStationId: bySlug["service-bar"]?.id,
        defaultCourse: "BEVERAGE",
        posGridIndex: 22,
      },
    });
  }

  if (!ribeye) {
    ribeye = await prisma.menuItem.findFirst({ where: { locationId, name: "Ribeye Steak" } });
  }

  let combo = await prisma.menuItem.findFirst({
    where: { locationId, name: "Steak & Shake Combo" },
  });
  if (!combo && ribeye && shake) {
    combo = await prisma.menuItem.create({
      data: {
        locationId,
        name: "Steak & Shake Combo",
        description: "Ribeye + hand-spun shake",
        price: 42.99,
        category: "Entrees",
        isCombo: true,
        defaultCourse: "MAIN",
        posGridIndex: 3,
      },
    });

    await prisma.menuComboComponent.createMany({
      data: [
        {
          comboItemId: combo.id,
          componentItemId: ribeye.id,
          quantity: 1,
          kitchenStationId: bySlug.grill?.id,
          sortOrder: 0,
        },
        {
          comboItemId: combo.id,
          componentItemId: shake.id,
          quantity: 1,
          kitchenStationId: bySlug["service-bar"]?.id,
          sortOrder: 1,
        },
      ],
    });
  }

  const pizza = await prisma.menuItem.findFirst({
    where: { locationId, category: "Pizza" },
  });
  if (pizza) {
    await prisma.menuItem.update({
      where: { id: pizza.id },
      data: { kitchenStationId: bySlug.pizza?.id, defaultCourse: "MAIN" },
    });

    const existingPie = await prisma.modifierGroup.findFirst({
      where: { locationId, slug: "pizza-toppings-half" },
    });
    if (!existingPie) {
      await prisma.modifierGroup.create({
        data: {
          locationId,
          name: "Half-and-half toppings",
          slug: "pizza-toppings-half",
          menuItemId: pizza.id,
          required: false,
          minSelect: 0,
          maxSelect: 8,
          layout: "FRACTIONAL_PIE",
          sortOrder: 0,
          options: {
            create: [
              { name: "Pepperoni", sortOrder: 0, priceDelta: 1.5, fractionCoverage: "WHOLE" },
              { name: "Mushroom", sortOrder: 1, priceDelta: 1.25, fractionCoverage: "WHOLE" },
              { name: "Sausage", sortOrder: 2, priceDelta: 1.5, fractionCoverage: "WHOLE" },
              { name: "Light sauce", sortOrder: 3, priceDelta: 0, fractionCoverage: "WHOLE" },
              { name: "Extra cheese", sortOrder: 4, priceDelta: 2, fractionCoverage: "WHOLE" },
            ],
          },
        },
      });
    }
  }
}
