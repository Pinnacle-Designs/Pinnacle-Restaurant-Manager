import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-auth";
import {
  DASHBOARD_AI_COMMANDS,
  MANAGER_PROMPT_CATEGORIES,
  searchPrompts,
} from "@/lib/ai/manager-prompts";

export async function GET(request: NextRequest) {
  const { error } = await requirePermission(request, "view_insights");
  if (error) return error;

  const q = request.nextUrl.searchParams.get("q") ?? "";
  const categoryId = request.nextUrl.searchParams.get("category") ?? "";

  if (categoryId) {
    const cat = MANAGER_PROMPT_CATEGORIES.find((c) => c.id === categoryId);
    if (!cat) {
      return NextResponse.json({ error: "Category not found" }, { status: 404 });
    }
    return NextResponse.json({
      id: cat.id,
      label: cat.label,
      prompts: cat.prompts,
    });
  }

  const results = q ? searchPrompts(q, 30) : undefined;

  return NextResponse.json({
    dashboardCommands: DASHBOARD_AI_COMMANDS,
    categories: MANAGER_PROMPT_CATEGORIES.map((c) => ({
      id: c.id,
      label: c.label,
      promptCount: c.prompts.length,
      sections: c.sections,
    })),
    prompts: results,
    totalPrompts: MANAGER_PROMPT_CATEGORIES.reduce((n, c) => n + c.prompts.length, 0),
  });
}
