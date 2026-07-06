import type { InvoiceData } from "@/lib/ai/analyze-invoice";
import { analyzeInvoice as analyzeInvoiceWithAi } from "@/lib/ai/analyze-invoice";
import type { ReceiptData } from "@/lib/ai";
import { analyzeReceipt as analyzeReceiptWithAi } from "@/lib/ai";
import type { OcrSource } from "./capabilities";
import { hasUsefulInvoiceData, parseInvoiceFromText } from "./parse-invoice-text";
import { hasUsefulReceiptData, parseReceiptFromText } from "./parse-receipt-text";

function emptyInvoice(today = new Date().toISOString().split("T")[0]!): InvoiceData {
  return {
    vendor: "",
    invoiceNumber: "",
    amount: 0,
    invoiceDate: today,
    lines: [],
  };
}

function emptyReceipt(today = new Date().toISOString().split("T")[0]!): ReceiptData {
  return {
    description: "Receipt expense",
    amount: 0,
    category: "Food & Supplies",
    date: today,
    vendor: "",
    items: [],
  };
}

async function extractServerText(imageBase64: string | string[]): Promise<string | null> {
  try {
    const { extractTextFromBase64Images } = await import("./server-extract");
    const text = (await extractTextFromBase64Images(imageBase64)).trim();
    return text || null;
  } catch (err) {
    console.warn("Server OCR fallback failed:", err);
    return null;
  }
}

async function resolveFromText(
  text: string,
  kind: "invoice" | "receipt"
): Promise<{ invoice?: InvoiceData; receipt?: ReceiptData; useful: boolean }> {
  if (kind === "invoice") {
    const invoice = parseInvoiceFromText(text);
    return { invoice, useful: hasUsefulInvoiceData(invoice) };
  }
  const receipt = parseReceiptFromText(text);
  return { receipt, useful: hasUsefulReceiptData(receipt) };
}

export async function resolveInvoiceScan(
  imageBase64: string | string[],
  options: { panoramic?: boolean; multiPage?: boolean; pageCount?: number },
  ocrText?: string | null
): Promise<{ invoice: InvoiceData; source: OcrSource }> {
  if (process.env.OPENAI_API_KEY?.trim()) {
    const ai = await analyzeInvoiceWithAi(imageBase64, options);
    if (hasUsefulInvoiceData(ai)) {
      return { invoice: ai, source: "ai" };
    }
  }

  const clientText = ocrText?.trim();
  if (clientText) {
    const parsed = await resolveFromText(clientText, "invoice");
    if (parsed.useful && parsed.invoice) {
      return { invoice: parsed.invoice, source: "local" };
    }
  }

  const serverText = await extractServerText(imageBase64);
  if (serverText) {
    const parsed = await resolveFromText(serverText, "invoice");
    if (parsed.useful && parsed.invoice) {
      return { invoice: parsed.invoice, source: "local" };
    }
  }

  if (clientText || serverText) {
    const best = parseInvoiceFromText(clientText || serverText || "");
    return { invoice: best, source: "local" };
  }

  return { invoice: emptyInvoice(), source: "none" };
}

export async function resolveReceiptScan(
  imageBase64: string | string[],
  options: { panoramic?: boolean; multiPage?: boolean; pageCount?: number },
  ocrText?: string | null
): Promise<{ receipt: ReceiptData; source: OcrSource }> {
  if (process.env.OPENAI_API_KEY?.trim()) {
    const ai = await analyzeReceiptWithAi(imageBase64, options);
    if (hasUsefulReceiptData(ai)) {
      return { receipt: ai, source: "ai" };
    }
  }

  const clientText = ocrText?.trim();
  if (clientText) {
    const parsed = await resolveFromText(clientText, "receipt");
    if (parsed.useful && parsed.receipt) {
      return { receipt: parsed.receipt, source: "local" };
    }
  }

  const serverText = await extractServerText(imageBase64);
  if (serverText) {
    const parsed = await resolveFromText(serverText, "receipt");
    if (parsed.useful && parsed.receipt) {
      return { receipt: parsed.receipt, source: "local" };
    }
  }

  if (clientText || serverText) {
    const best = parseReceiptFromText(clientText || serverText || "");
    return { receipt: best, source: "local" };
  }

  return { receipt: emptyReceipt(), source: "none" };
}
