"use client";

import { cn } from "@/lib/utils";
import { MENU_COURSES, MENU_COURSE_SHORT, type MenuCourseId } from "@/lib/kitchen/courses";

interface CoursePickerProps {
  value: MenuCourseId;
  onChange: (course: MenuCourseId) => void;
  compact?: boolean;
}

export function CoursePicker({ value, onChange, compact }: CoursePickerProps) {
  return (
    <div className={cn("flex flex-wrap gap-1", compact ? "" : "gap-1.5")}>
      {MENU_COURSES.filter((c) => c !== "OTHER").map((course) => (
        <button
          key={course}
          type="button"
          onClick={() => onChange(course)}
          className={cn(
            "rounded-md font-semibold transition-colors",
            compact ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-xs",
            value === course
              ? "bg-orange-500 text-white"
              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          )}
        >
          {MENU_COURSE_SHORT[course]}
        </button>
      ))}
    </div>
  );
}
