import OpenAI from "openai";
import { visionScanHint, type VisionScanOptions } from "@/lib/scan/parse-scan-form";

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

export interface DamageAnalysis {
  vendor: string;
  itemDescription: string;
  category: "DAMAGED" | "SPOILED" | "SHORT_SHIP" | "MISSING" | "OTHER";
  estimatedAmount: number;
  reason: string;
  qtyAffected: number;
  unit: string;
}

export async function analyzeDamagePhoto(
  imageBase64: string | string[],
  options?: VisionScanOptions & { pageCount?: number }
): Promise<DamageAnalysis> {
  const images = Array.isArray(imageBase64) ? imageBase64 : [imageBase64];
  const multiPage = images.length > 1;
  const panoramic = options?.panoramic ?? false;

  const fallback: DamageAnalysis = {
    vendor: "",
    itemDescription: "Damaged goods",
    category: "DAMAGED",
    estimatedAmount: 0,
    reason: "Damage reported — enter details manually",
    qtyAffected: 1,
    unit: "case",
  };

  if (!openai) return fallback;

  try {
    const hint = visionScanHint("loading dock damage photo", {
      panoramic,
      multiPage,
      pageCount: options?.pageCount ?? images.length,
    });

    const content: Array<
      | { type: "text"; text: string }
      | { type: "image_url"; image_url: { url: string } }
    > = [
      {
        type: "text",
        text: `${hint}

This photo shows damaged, spoiled, or missing vendor goods (e.g. shattered glass cups, rotten produce, crushed boxes).

Return JSON:
- vendor (supplier name if visible on box/label, else empty string)
- itemDescription (what was damaged)
- category: DAMAGED | SPOILED | SHORT_SHIP | MISSING | OTHER
- estimatedAmount (reasonable credit $ request as number, 0 if unknown)
- reason (one sentence for vendor credit memo)
- qtyAffected (number)
- unit (case, each, lb, etc.)`,
      },
      ...images.map((b64) => ({
        type: "image_url" as const,
        image_url: { url: `data:image/jpeg;base64,${b64}` },
      })),
    ];

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content }],
      max_tokens: multiPage || panoramic ? 800 : 500,
      response_format: { type: "json_object" },
    });

    const responseContent = response.choices[0]?.message?.content;
    if (!responseContent) return fallback;

    const parsed = JSON.parse(responseContent);
    const category = String(parsed.category || "DAMAGED").toUpperCase();
    const valid = ["DAMAGED", "SPOILED", "SHORT_SHIP", "MISSING", "OTHER"];

    return {
      vendor: String(parsed.vendor || "").trim(),
      itemDescription: String(parsed.itemDescription || "Damaged goods").trim(),
      category: (valid.includes(category) ? category : "DAMAGED") as DamageAnalysis["category"],
      estimatedAmount: parseFloat(String(parsed.estimatedAmount)) || 0,
      reason: String(parsed.reason || "Damaged goods credit request").trim(),
      qtyAffected: parseFloat(String(parsed.qtyAffected)) || 1,
      unit: String(parsed.unit || "case").trim(),
    };
  } catch {
    return fallback;
  }
}

// re-export for callers that pass single image
export { base64Input } from "@/lib/scan/parse-scan-form";
