import { prisma } from "@/lib/prisma";
import {
  DEFAULT_FLOOR_PLAN_SECTIONS,
  DEFAULT_TABLE_LAYOUT,
  type FloorPlanSection,
} from "./floor-plan-constants";

export type { FloorPlanSection } from "./floor-plan-constants";
export { DEFAULT_FLOOR_PLAN_SECTIONS, DEFAULT_TABLE_LAYOUT } from "./floor-plan-constants";

export function parseFloorPlanSections(raw: string | null | undefined): FloorPlanSection[] {
  if (!raw) return DEFAULT_FLOOR_PLAN_SECTIONS;
  try {
    const parsed = JSON.parse(raw) as FloorPlanSection[];
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : DEFAULT_FLOOR_PLAN_SECTIONS;
  } catch {
    return DEFAULT_FLOOR_PLAN_SECTIONS;
  }
}

export function serializeFloorPlanSections(sections: FloorPlanSection[]): string {
  return JSON.stringify(sections);
}

/** Assign grid positions to tables that have never been placed on the canvas. */
export function fillMissingPositions<
  T extends { posX: number; posY: number; number: number }
>(tables: T[], planWidth: number, planHeight: number): T[] {
  const needsLayout = tables.every((t) => t.posX === 0 && t.posY === 0);
  if (!needsLayout) return tables;

  const byNumber = new Map(DEFAULT_TABLE_LAYOUT.map((d) => [d.number, d]));
  return tables.map((t) => {
    const preset = byNumber.get(t.number);
    if (preset) {
      return { ...t, ...preset, posX: preset.posX, posY: preset.posY };
    }
    const cols = Math.ceil(Math.sqrt(tables.length));
    const idx = tables.findIndex((x) => x.number === t.number);
    const col = idx % cols;
    const row = Math.floor(idx / cols);
    const cellW = planWidth / (cols + 1);
    const cellH = planHeight / (Math.ceil(tables.length / cols) + 1);
    return {
      ...t,
      posX: cellW * (col + 1) - 36,
      posY: cellH * (row + 1) - 36,
    };
  });
}

export async function ensureFloorPlanDefaults(locationId: string) {
  const loc = await prisma.location.findUnique({ where: { id: locationId } });
  if (!loc) return;

  if (!loc.floorPlanSections) {
    await prisma.location.update({
      where: { id: locationId },
      data: { floorPlanSections: serializeFloorPlanSections(DEFAULT_FLOOR_PLAN_SECTIONS) },
    });
  }

  const tables = await prisma.table.findMany({ where: { locationId } });
  const allAtOrigin = tables.length > 0 && tables.every((t) => t.posX === 0 && t.posY === 0);
  if (!allAtOrigin) return;

  for (const layout of DEFAULT_TABLE_LAYOUT) {
    const table = tables.find((t) => t.number === layout.number);
    if (!table) continue;
    await prisma.table.update({
      where: { id: table.id },
      data: {
        section: layout.section,
        shape: layout.shape,
        posX: layout.posX,
        posY: layout.posY,
        width: layout.width,
        height: layout.height,
      },
    });
  }
}
