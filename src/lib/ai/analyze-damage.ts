import OpenAI from "openai";

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

export async function analyzeDamagePhoto(imageBase64: string): Promise<DamageAnalysis> {
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
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `This is a photo from a restaurant loading dock or back of house showing damaged, spoiled, or missing vendor goods (e.g. shattered glass cups, rotten produce, crushed boxes).

Return JSON:
- vendor (supplier name if visible on box/label, else empty string)
- itemDescription (what was damaged)
- category: DAMAGED | SPOILED | SHORT_SHIP | MISSING | OTHER
- estimatedAmount (reasonable credit $ request as number, 0 if unknown)
- reason (one sentence for vendor credit memo)
- qtyAffected (number)
- unit (case, each, lb, etc.)`,
            },
            {
              type: "image_url",
              image_url: { url: `data:image/jpeg;base64,${imageBase64}` },
            },
          ],
        },
      ],
      max_tokens: 500,
      response_format: { type: "json_object" },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) return fallback;

    const parsed = JSON.parse(content);
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
