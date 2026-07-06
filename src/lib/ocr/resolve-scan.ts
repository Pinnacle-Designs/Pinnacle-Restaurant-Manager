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

  const text = ocrText?.trim();
  if (text) {
    const local = parseInvoiceFromText(text);
    if (hasUsefulInvoiceData(local)) {
      return { invoice: local, source: "local" };
    }
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

  const text = ocrText?.trim();
  if (text) {
    const local = parseReceiptFromText(text);
    if (hasUsefulReceiptData(local)) {
      return { receipt: local, source: "local" };
    }
  }

  return { receipt: emptyReceipt(), source: "none" };
}
