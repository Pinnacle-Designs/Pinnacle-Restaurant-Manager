import type { InvoiceData } from "@/lib/ai/analyze-invoice";
import { analyzeInvoice as analyzeInvoiceWithAi } from "@/lib/ai/analyze-invoice";
import type { ReceiptData } from "@/lib/ai";
import { analyzeReceipt as analyzeReceiptWithAi } from "@/lib/ai";
import type { OcrSource } from "./capabilities";
import {
  hasUsefulInvoiceData,
  mergeInvoiceData,
  parseInvoiceFromText,
} from "./parse-invoice-text";
import { hasUsefulReceiptData, mergeReceiptData, parseReceiptFromText } from "./parse-receipt-text";
import {
  applyVendorMemoryToInvoice,
  applyVendorMemoryToReceipt,
  buildVendorOcrContext,
  guessVendorFromMemory,
} from "./vendor-memory";

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

function pickInvoiceSource(ai: InvoiceData | null, merged: InvoiceData): OcrSource {
  if (!ai) return "local";
  const aiUseful = hasUsefulInvoiceData(ai);
  const mergedUseful = hasUsefulInvoiceData(merged);
  if (!mergedUseful) return aiUseful ? "ai" : "none";
  if (aiUseful && merged.lines.length <= ai.lines.length) return "ai";
  if (aiUseful && ai.lines.length > 0) return "ai";
  return "local";
}

export async function resolveInvoiceScan(
  imageBase64: string | string[],
  options: {
    panoramic?: boolean;
    multiPage?: boolean;
    pageCount?: number;
    locationId?: string;
  },
  ocrText?: string | null
): Promise<{ invoice: InvoiceData; source: OcrSource; memoryApplied: boolean; memoryScanCount: number }> {
  const locationId = options.locationId;
  const clientText = ocrText?.trim() || null;
  const serverText = clientText ? null : await extractServerText(imageBase64);
  const text = clientText || serverText || "";

  const localDraft = text ? parseInvoiceFromText(text) : emptyInvoice();
  let vendorHint = localDraft.vendor?.trim() || "";

  if (locationId && vendorHint) {
    const guessed = await guessVendorFromMemory(locationId, vendorHint);
    if (guessed) vendorHint = guessed;
  }

  let memoryCtx = locationId
    ? await buildVendorOcrContext(locationId, vendorHint || undefined)
    : {
        scanCount: 0,
        aliases: [],
        skuHints: [],
        topVendors: [],
        promptBlock: "",
      };

  let ai: InvoiceData | null = null;
  if (process.env.OPENAI_API_KEY?.trim()) {
    ai = await analyzeInvoiceWithAi(
      imageBase64,
      options,
      text || undefined,
      memoryCtx.promptBlock || undefined
    );
  }

  let merged = ai ? mergeInvoiceData(ai, localDraft) : localDraft;

  if (locationId) {
    const refinedHint = merged.vendor?.trim() || vendorHint;
    if (refinedHint && refinedHint !== vendorHint) {
      memoryCtx = await buildVendorOcrContext(locationId, refinedHint);
    }
    const before = JSON.stringify(merged);
    merged = applyVendorMemoryToInvoice(merged, memoryCtx);
    const memoryApplied = before !== JSON.stringify(merged);

    return {
      invoice: merged,
      source: pickInvoiceSource(ai, merged),
      memoryApplied,
      memoryScanCount: memoryCtx.scanCount,
    };
  }

  return {
    invoice: merged,
    source: ai ? pickInvoiceSource(ai, merged) : text && hasUsefulInvoiceData(localDraft) ? "local" : "none",
    memoryApplied: false,
    memoryScanCount: 0,
  };
}

function pickReceiptSource(ai: ReceiptData | null, merged: ReceiptData): OcrSource {
  if (!ai) return "local";
  if (hasUsefulReceiptData(ai) && hasUsefulReceiptData(merged)) return "ai";
  if (hasUsefulReceiptData(ai)) return "ai";
  if (hasUsefulReceiptData(merged)) return "local";
  return "none";
}

export async function resolveReceiptScan(
  imageBase64: string | string[],
  options: {
    panoramic?: boolean;
    multiPage?: boolean;
    pageCount?: number;
    locationId?: string;
  },
  ocrText?: string | null
): Promise<{ receipt: ReceiptData; source: OcrSource; memoryApplied: boolean; memoryScanCount: number }> {
  const locationId = options.locationId;
  const clientText = ocrText?.trim() || null;
  const serverText = clientText ? null : await extractServerText(imageBase64);
  const text = clientText || serverText || "";

  const localDraft = text ? parseReceiptFromText(text) : emptyReceipt();
  let vendorHint = localDraft.vendor?.trim() || "";

  if (locationId && vendorHint) {
    const guessed = await guessVendorFromMemory(locationId, vendorHint);
    if (guessed) vendorHint = guessed;
  }

  let memoryCtx = locationId
    ? await buildVendorOcrContext(locationId, vendorHint || undefined)
    : {
        scanCount: 0,
        aliases: [],
        skuHints: [],
        topVendors: [],
        promptBlock: "",
      };

  let ai: ReceiptData | null = null;
  if (process.env.OPENAI_API_KEY?.trim()) {
    ai = await analyzeReceiptWithAi(
      imageBase64,
      options,
      text || undefined,
      memoryCtx.promptBlock || undefined
    );
  }

  let merged = ai ? mergeReceiptData(ai, localDraft) : localDraft;

  if (locationId) {
    const refinedHint = merged.vendor?.trim() || vendorHint;
    if (refinedHint && refinedHint !== vendorHint) {
      memoryCtx = await buildVendorOcrContext(locationId, refinedHint);
    }
    const before = JSON.stringify(merged);
    merged = applyVendorMemoryToReceipt(merged, memoryCtx);
    const memoryApplied = before !== JSON.stringify(merged);

    return {
      receipt: merged,
      source: pickReceiptSource(ai, merged),
      memoryApplied,
      memoryScanCount: memoryCtx.scanCount,
    };
  }

  return {
    receipt: merged,
    source: ai
      ? pickReceiptSource(ai, merged)
      : text && hasUsefulReceiptData(localDraft)
        ? "local"
        : "none",
    memoryApplied: false,
    memoryScanCount: 0,
  };
}
