import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-auth";
import { HOLIDAY_PAY_TEMPLATES } from "@/lib/payroll/holiday-pay";

export async function GET(request: NextRequest) {
  const { error } = await requirePermission(request, "manage_payroll");
  if (error) return error;

  return NextResponse.json({
    templates: HOLIDAY_PAY_TEMPLATES.map((t) => ({
      id: t.id,
      name: t.name,
      region: t.region,
      description: t.description,
    })),
  });
}
