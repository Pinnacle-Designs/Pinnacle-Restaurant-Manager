export interface FloorPlanSection {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
}

export const DEFAULT_FLOOR_PLAN_SECTIONS: FloorPlanSection[] = [
  { id: "main", name: "Main Dining", x: 40, y: 40, width: 520, height: 360, color: "#f1f5f9" },
  { id: "bar", name: "Bar", x: 580, y: 40, width: 280, height: 160, color: "#e2e8f0" },
  { id: "patio", name: "Patio", x: 580, y: 220, width: 280, height: 180, color: "#dcfce7" },
];

export const DEFAULT_TABLE_LAYOUT: Array<{
  number: number;
  section: string;
  shape: string;
  posX: number;
  posY: number;
  width: number;
  height: number;
  capacity: number;
}> = [
  { number: 1, section: "main", shape: "round", posX: 90, posY: 90, width: 64, height: 64, capacity: 2 },
  { number: 2, section: "main", shape: "round", posX: 200, posY: 90, width: 64, height: 64, capacity: 2 },
  { number: 3, section: "main", shape: "square", posX: 310, posY: 80, width: 80, height: 80, capacity: 4 },
  { number: 4, section: "main", shape: "square", posX: 420, posY: 80, width: 80, height: 80, capacity: 4 },
  { number: 5, section: "main", shape: "square", posX: 90, posY: 220, width: 80, height: 80, capacity: 4 },
  { number: 6, section: "main", shape: "rectangle", posX: 210, posY: 210, width: 100, height: 72, capacity: 6 },
  { number: 7, section: "main", shape: "rectangle", posX: 340, posY: 210, width: 100, height: 72, capacity: 6 },
  { number: 8, section: "main", shape: "rectangle", posX: 90, posY: 330, width: 120, height: 56, capacity: 8 },
  { number: 9, section: "bar", shape: "bar", posX: 620, posY: 70, width: 48, height: 100, capacity: 2 },
  { number: 10, section: "bar", shape: "bar", posX: 700, posY: 70, width: 48, height: 100, capacity: 2 },
  { number: 11, section: "patio", shape: "round", posX: 620, posY: 260, width: 72, height: 72, capacity: 4 },
  { number: 12, section: "patio", shape: "round", posX: 730, posY: 260, width: 72, height: 72, capacity: 4 },
];
