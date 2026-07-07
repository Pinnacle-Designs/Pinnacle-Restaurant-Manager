import OpenAI from "openai";
import { visionScanHint } from "@/lib/scan/parse-scan-form";

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

import { isAiOcrConfigured } from "@/lib/ocr/capabilities";

export function isInvoiceOcrConfigured(): boolean {
  return isAiOcrConfigured();
}

export interface InvoiceLineData {
  description: string;
  qty: number;
  unit: string;
  unitPrice: number;
  lineTotal: number;
  sku?: string;
  /** Catch-weight: pounds billed when sold by case (brisket, fish, etc.) */
  catchWeightBilled?: number;
  catchWeightUnit?: string;
}

export interface InvoiceData {
  vendor: string;
  invoiceNumber: string;
  amount: number;
  invoiceDate: string;
  lines: InvoiceLineData[];
}

function parseInvoiceJson(parsed: Record<string, unknown>, today: string): InvoiceData {
  const rawLines = Array.isArray(parsed.lines) ? parsed.lines : [];
  const lines: InvoiceLineData[] = rawLines.map((l: Record<string, unknown>) => ({
      description: String(l.description ?? "Item"),
      qty: parseFloat(String(l.qty)) || 0,
      unit: String(l.unit ?? "each"),
      unitPrice: parseFloat(String(l.unitPrice)) || 0,
      lineTotal: parseFloat(String(l.lineTotal)) || 0,
      sku: l.sku ? String(l.sku) : undefined,
      catchWeightBilled:
        l.catchWeightBilled != null ? parseFloat(String(l.catchWeightBilled)) : undefined,
      catchWeightUnit: l.catchWeightUnit ? String(l.catchWeightUnit) : undefined,
    }));

  const amount =
    parseFloat(String(parsed.amount)) || lines.reduce((s, l) => s + l.lineTotal, 0);

  return {
    vendor: String(parsed.vendor ?? "Unknown"),
    invoiceNumber: String(parsed.invoiceNumber ?? ""),
    amount,
    invoiceDate: String(parsed.invoiceDate ?? today),
    lines,
  };
}

export async function analyzeInvoice(
  imageBase64: string | string[],
  options?: { panoramic?: boolean; multiPage?: boolean; pageCount?: number },
  ocrText?: string,
  vendorMemoryPrompt?: string
): Promise<InvoiceData> {
  const images = Array.isArray(imageBase64) ? imageBase64 : [imageBase64];
  const multiPage = options?.multiPage ?? images.length > 1;
  const panoramic = options?.panoramic ?? false;
  const pageCount = options?.pageCount ?? images.length;
  const today = new Date().toISOString().split("T")[0]!;
  const fallback: InvoiceData = {
    vendor: "Unknown vendor",
    invoiceNumber: "",
    amount: 0,
    invoiceDate: today,
    lines: [],
  };

  if (!openai) {
    return {
      ...fallback,
      vendor: "",
      lines: [],
    };
  }

  try {
    const pageHint = `${visionScanHint("vendor invoice or delivery report", {
      panoramic,
      multiPage,
      pageCount,
    })} Extract data for a restaurant accounts payable record.`;

    const ocrHint = ocrText?.trim()
      ? `\n\nOn-device OCR text (may contain errors — prefer the image, use OCR to fill gaps):\n${ocrText.trim().slice(0, 12_000)}`
      : "";

    const content: Array<
      | { type: "text"; text: string }
      | { type: "image_url"; image_url: { url: string } }
    > = [
      {
        type: "text",
        text: `${pageHint} Return JSON with:
- vendor (supplier name)
- invoiceNumber (invoice or PO number if visible)
- amount (invoice total as number — use "Total Invoice" / "Amount Due" / subtotal+tax, NOT unit prices)
- invoiceDate (YYYY-MM-DD)
- lines: array of { description, qty (number), unit (string like lbs/case/each), unitPrice (number), lineTotal (number), sku (optional), catchWeightBilled (optional number — actual weight in lbs when sold by case/box, e.g. brisket 42.5 lbs), catchWeightUnit (optional, default lbs) }

Food distributor invoices often use wide tables with columns: item code, description, qty ordered, qty shipped, package, unit price, extended price. Extract EVERY product row. lineTotal must be the extended price column (qty × unit price), not the unit price alone.

Read crinkled, watermarked, or stained paper carefully. For meat/seafood sold by case with a billed weight, capture catchWeightBilled separately from case qty.${ocrHint}${vendorMemoryPrompt ?? ""}`,
      },
      ...images.map((b64) => ({
        type: "image_url" as const,
        image_url: { url: `data:image/jpeg;base64,${b64}` },
      })),
    ];

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content }],
      max_tokens: multiPage ? 4096 : panoramic ? 3000 : 2500,
      response_format: { type: "json_object" },
    });

    const responseContent = response.choices[0]?.message?.content;
    if (!responseContent) return fallback;

    return parseInvoiceJson(JSON.parse(responseContent), today);
  } catch {
    return fallback;
  }
}
