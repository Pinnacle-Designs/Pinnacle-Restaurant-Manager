import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-auth";
import { analyzeDamagePhoto } from "@/lib/ai/analyze-damage";
import {
  base64Input,
  filesToBase64,
  parseScanFormData,
} from "@/lib/scan/parse-scan-form";

export async function POST(request: NextRequest) {
  const { error } = await requirePermission(request, "manage_inventory");
  if (error) return error;

  try {
    const formData = await request.formData();
    const { files, panoramic, pageCount } = parseScanFormData(formData);

    if (files.length === 0) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const base64Images = await filesToBase64(files);
    const analysis = await analyzeDamagePhoto(base64Input(base64Images), {
      panoramic: panoramic && base64Images.length === 1,
      pageCount,
    });

    return NextResponse.json({
      analysis,
      pageCount,
      panoramic: panoramic || files.length > 1,
    });
  } catch (err) {
    console.error("Damage scan error:", err);
    return NextResponse.json({ error: "Scan failed" }, { status: 500 });
  }
}
