import OpenAI from "openai";

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

export interface InvoiceLineData {
  description: string;
  qty: number;
  unit: string;
  unitPrice: number;
  lineTotal: number;
  sku?: string;
}

export interface InvoiceData {
  vendor: string;
  invoiceNumber: string;
  amount: number;
  invoiceDate: string;
  lines: InvoiceLineData[];
}

export async function analyzeInvoice(imageBase64: string): Promise<InvoiceData> {
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
      vendor: "Vendor (manual entry — set OPENAI_API_KEY)",
      lines: [
        { description: "Line item 1", qty: 1, unit: "case", unitPrice: 0, lineTotal: 0 },
      ],
    };
  }

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Extract data from this vendor invoice image for a restaurant accounts payable record. Return JSON with:
- vendor (supplier name)
- invoiceNumber (invoice or PO number if visible)
- amount (invoice total as number, including tax)
- invoiceDate (YYYY-MM-DD)
- lines: array of { description, qty (number), unit (string like lbs/case/each), unitPrice (number), lineTotal (number), sku (optional product code) }

Read crinkled or stained paper carefully. Use line totals that match qty * unitPrice when possible.`,
            },
            {
              type: "image_url",
              image_url: { url: `data:image/jpeg;base64,${imageBase64}` },
            },
          ],
        },
      ],
      max_tokens: 1200,
      response_format: { type: "json_object" },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) return fallback;

    const parsed = JSON.parse(content);
    const lines: InvoiceLineData[] = (parsed.lines ?? []).map(
      (l: Record<string, unknown>) => ({
        description: String(l.description ?? "Item"),
        qty: parseFloat(String(l.qty)) || 0,
        unit: String(l.unit ?? "each"),
        unitPrice: parseFloat(String(l.unitPrice)) || 0,
        lineTotal: parseFloat(String(l.lineTotal)) || 0,
        sku: l.sku ? String(l.sku) : undefined,
      })
    );

    const amount =
      parseFloat(String(parsed.amount)) ||
      lines.reduce((s, l) => s + l.lineTotal, 0);

    return {
      vendor: String(parsed.vendor ?? "Unknown"),
      invoiceNumber: String(parsed.invoiceNumber ?? ""),
      amount,
      invoiceDate: String(parsed.invoiceDate ?? today),
      lines,
    };
  } catch {
    return fallback;
  }
}
