import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-auth";
import { analyzeDamagePhoto } from "@/lib/ai/analyze-damage";
import {
  base64Input,
  filesToBase64,
  parseScanFormData,
  visionScanFromParsed,
} from "@/lib/scan/parse-scan-form";

export async function POST(request: NextRequest) {
  const { error } = await requirePermission(request, "manage_inventory");
  if (error) return error;

  try {
    const formData = await request.formData();
    const parsed = parseScanFormData(formData);

    if (parsed.files.length === 0) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const base64Images = await filesToBase64(parsed.files);
    const vision = visionScanFromParsed(parsed);
    const analysis = await analyzeDamagePhoto(base64Input(base64Images), vision);

    return NextResponse.json({
      analysis,
      pageCount: parsed.pageCount,
      panoramic: vision.panoramic || parsed.stitchedMulti,
    });
  } catch (err) {
    console.error("Damage scan error:", err);
    return NextResponse.json({ error: "Scan failed" }, { status: 500 });
  }
}
