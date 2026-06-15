import { prisma } from "@/lib/prisma";
import type { MenuCourseId } from "./courses";
import { normalizeCourse } from "./courses";
import {
  defaultStationSlugForCategory,
  ensureKitchenStations,
  type KitchenStationDto,
} from "./stations";

export type OrderLineInput = {
  menuItemId: string;
  quantity: number;
  price: number;
  seatNumber?: number | null;
  modifiers?: string | null;
  modifierSummary?: string | null;
  course?: string;
  kitchenStatus: string;
  firedAt: Date | null;
  routesToKitchen: boolean;
  kitchenStationId: string | null;
  parentOrderItemId?: string | null;
};

type MenuItemWithRouting = {
  id: string;
  name: string;
  category: string;
  price: number;
  isCombo: boolean;
  defaultCourse: string;
  kitchenStationId: string | null;
  comboComponents: Array<{
    id: string;
    quantity: number;
    kitchenStationId: string | null;
    componentItem: {
      id: string;
      name: string;
      category: string;
      kitchenStationId: string | null;
    };
  }>;
};

export async function loadMenuItemForRouting(
  menuItemId: string,
  locationId: string
): Promise<MenuItemWithRouting | null> {
  return prisma.menuItem.findFirst({
    where: { id: menuItemId, locationId },
    include: {
      comboComponents: {
        orderBy: { sortOrder: "asc" },
        include: {
          componentItem: {
            select: {
              id: true,
              name: true,
              category: true,
              kitchenStationId: true,
            },
          },
        },
      },
    },
  });
}

function resolveStationId(
  menuItem: { kitchenStationId: string | null; category: string },
  stationBySlug: Record<string, KitchenStationDto>,
  overrideStationId?: string | null
): string | null {
  if (overrideStationId) return overrideStationId;
  if (menuItem.kitchenStationId) return menuItem.kitchenStationId;
  const slug = defaultStationSlugForCategory(menuItem.category);
  const station = Object.values(stationBySlug).find((s) => s.slug === slug);
  return station?.id ?? Object.values(stationBySlug)[0]?.id ?? null;
}

/** Build order lines — expands combos into per-station kitchen tickets. */
export async function buildOrderLinesForMenuItem(input: {
  locationId: string;
  menuItemId: string;
  quantity: number;
  linePrice: number;
  seatNumber?: number | null;
  modifiers?: string | null;
  modifierSummary?: string | null;
  course?: string;
  fireNow: boolean;
}): Promise<OrderLineInput[]> {
  const menuItem = await loadMenuItemForRouting(input.menuItemId, input.locationId);
  if (!menuItem) {
    throw new Error("Menu item not found");
  }

  const stations = await ensureKitchenStations(input.locationId);
  const stationBySlug = Object.fromEntries(stations.map((s) => [s.slug, s]));
  const stationById = Object.fromEntries(stations.map((s) => [s.id, s]));
  const course = normalizeCourse(input.course ?? menuItem.defaultCourse);
  const kitchenStatus = input.fireNow ? "FIRED" : "PENDING";
  const firedAt = input.fireNow ? new Date() : null;

  if (!menuItem.isCombo || menuItem.comboComponents.length === 0) {
    return [
      {
        menuItemId: menuItem.id,
        quantity: input.quantity,
        price: input.linePrice,
        seatNumber: input.seatNumber,
        modifiers: input.modifiers,
        modifierSummary: input.modifierSummary,
        course,
        kitchenStatus,
        firedAt,
        routesToKitchen: true,
        kitchenStationId: resolveStationId(menuItem, stationBySlug),
      },
    ];
  }

  const parentLine: OrderLineInput = {
    menuItemId: menuItem.id,
    quantity: input.quantity,
    price: input.linePrice,
    seatNumber: input.seatNumber,
    modifiers: input.modifiers,
    modifierSummary: input.modifierSummary,
    course,
    kitchenStatus: "HELD",
    firedAt: null,
    routesToKitchen: false,
    kitchenStationId: null,
  };

  const childLines: OrderLineInput[] = menuItem.comboComponents.flatMap((component) => {
    const comp = component.componentItem;
    const stationId = resolveStationId(
      comp,
      stationBySlug,
      component.kitchenStationId
    );
    const stationName = stationId ? stationById[stationId]?.name : null;
    return Array.from({ length: component.quantity }, () => ({
      menuItemId: comp.id,
      quantity: 1,
      price: 0,
      seatNumber: input.seatNumber,
      modifiers: null,
      modifierSummary: stationName ? `↳ ${comp.name} → ${stationName}` : `↳ ${comp.name}`,
      course,
      kitchenStatus,
      firedAt,
      routesToKitchen: true,
      kitchenStationId: stationId,
      parentOrderItemId: "__PARENT__",
    }));
  });

  return [parentLine, ...childLines];
}

export function kitchenLineFilter() {
  return { routesToKitchen: true };
}

export function pendingKitchenItems<T extends { routesToKitchen?: boolean; kitchenStatus?: string }>(
  items: T[]
) {
  return items.filter((i) => i.routesToKitchen !== false && i.kitchenStatus === "PENDING");
}

export function pendingByCourse<T extends { course?: string; routesToKitchen?: boolean; kitchenStatus?: string }>(
  items: T[],
  course: MenuCourseId
) {
  return pendingKitchenItems(items).filter((i) => normalizeCourse(i.course) === course);
}
