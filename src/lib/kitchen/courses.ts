export const MENU_COURSES = ["APPETIZER", "MAIN", "DESSERT", "BEVERAGE", "OTHER"] as const;
export type MenuCourseId = (typeof MENU_COURSES)[number];

export const MENU_COURSE_LABELS: Record<MenuCourseId, string> = {
  APPETIZER: "Appetizers",
  MAIN: "Mains",
  DESSERT: "Desserts",
  BEVERAGE: "Beverages",
  OTHER: "Other",
};

export const MENU_COURSE_SHORT: Record<MenuCourseId, string> = {
  APPETIZER: "Apps",
  MAIN: "Mains",
  DESSERT: "Dessert",
  BEVERAGE: "Bev",
  OTHER: "Other",
};

export function isMenuCourse(value: string): value is MenuCourseId {
  return MENU_COURSES.includes(value as MenuCourseId);
}

export function normalizeCourse(value: string | null | undefined): MenuCourseId {
  if (value && isMenuCourse(value)) return value;
  return "MAIN";
}
