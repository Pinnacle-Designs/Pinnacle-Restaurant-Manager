import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getLocationIdFromRequest } from "@/lib/location";
import { requirePermission } from "@/lib/api-auth";
import { analyzeDamagePhoto } from "@/lib/ai/analyze-damage";

export async function POST(request: NextRequest) {
  const { error } = await requirePermission(request, "manage_inventory");
  if (error) return error;

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const base64 = Buffer.from(bytes).toString("base64");
    const analysis = await analyzeDamagePhoto(base64);

    return NextResponse.json({ analysis });
  } catch (err) {
    console.error("Damage scan error:", err);
    return NextResponse.json({ error: "Scan failed" }, { status: 500 });
  }
}
