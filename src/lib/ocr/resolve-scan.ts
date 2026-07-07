import type { InvoiceData } from "@/lib/ai/analyze-invoice";
import { analyzeInvoice as analyzeInvoiceWithAi } from "@/lib/ai/analyze-invoice";
import type { ReceiptData } from "@/lib/ai";
import { analyzeReceipt as analyzeReceiptWithAi } from "@/lib/ai";
import type { OcrSource } from "./capabilities";
import { prepareOcrTextForParsing } from "./ocr-corrections";
import { isWeakOcrText, mergeOcrTextPassages } from "./ocr-text-score";
import {
  hasUsefulInvoiceData,
  mergeInvoiceData,
  parseInvoiceFromText,
  scoreInvoiceData,
} from "./parse-invoice-text";
import {
  hasUsefulReceiptData,
  mergeReceiptData,
  parseReceiptFromText,
  scoreReceiptData,
} from "./parse-receipt-text";
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

function aiOcrEnabled(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim() && process.env.OCR_DISABLE_AI !== "true");
}

async function extractServerText(
  imageBase64: string | string[],
  kind: "invoice" | "receipt"
): Promise<string | null> {
  try {
    const { extractTextFromBase64Images } = await import("./server-extract");
    const text = (await extractTextFromBase64Images(imageBase64, kind)).trim();
    return text || null;
  } catch (err) {
    console.warn("Server OCR fallback failed:", err);
    return null;
  }
}

async function resolveOcrText(
  imageBase64: string | string[],
  clientText: string | null,
  kind: "invoice" | "receipt"
): Promise<string> {
  const serverText =
    !clientText || isWeakOcrText(clientText, kind)
      ? await extractServerText(imageBase64, kind)
      : null;

  return mergeOcrTextPassages(clientText, serverText);
}

function pickInvoiceSource(
  ai: InvoiceData | null,
  local: InvoiceData,
  merged: InvoiceData
): OcrSource {
  if (!ai) {
    return hasUsefulInvoiceData(local) ? "local" : "none";
  }

  const localScore = scoreInvoiceData(local);
  const aiScore = scoreInvoiceData(ai);
  const mergedScore = scoreInvoiceData(merged);

  if (!hasUsefulInvoiceData(merged)) {
    if (aiScore >= localScore && hasUsefulInvoiceData(ai)) return "ai";
    if (hasUsefulInvoiceData(local)) return "local";
    return "none";
  }

  if (localScore >= aiScore + 2 || local.lines.length > ai.lines.length) return "local";
  if (aiScore > localScore && hasUsefulInvoiceData(ai)) return "ai";
  if (mergedScore >= Math.max(localScore, aiScore)) return localScore >= aiScore ? "local" : "ai";
  return "local";
}

function pickReceiptSource(
  ai: ReceiptData | null,
  local: ReceiptData,
  merged: ReceiptData
): OcrSource {
  if (!ai) {
    return hasUsefulReceiptData(local) ? "local" : "none";
  }

  const localScore = scoreReceiptData(local);
  const aiScore = scoreReceiptData(ai);
  const mergedScore = scoreReceiptData(merged);

  if (!hasUsefulReceiptData(merged)) {
    if (aiScore >= localScore && hasUsefulReceiptData(ai)) return "ai";
    if (hasUsefulReceiptData(local)) return "local";
    return "none";
  }

  if (localScore >= aiScore + 1 || local.items.length > ai.items.length) return "local";
  if (aiScore > localScore && hasUsefulReceiptData(ai)) return "ai";
  if (mergedScore >= Math.max(localScore, aiScore)) return localScore >= aiScore ? "local" : "ai";
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
  const text = await resolveOcrText(imageBase64, ocrText?.trim() || null, "invoice");

  const roughDraft = text ? parseInvoiceFromText(text) : emptyInvoice();
  let vendorHint = roughDraft.vendor?.trim() || "";

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
        layoutHints: {},
        promptBlock: "",
      };

  const preparedText = text ? prepareOcrTextForParsing(text, memoryCtx) : "";
  const localDraft = preparedText
    ? parseInvoiceFromText(preparedText, {
        itemCodePattern: memoryCtx.layoutHints.itemCodePattern,
        totalLabel: memoryCtx.layoutHints.totalLabel,
        skuHints: memoryCtx.skuHints,
      })
    : emptyInvoice();

  let ai: InvoiceData | null = null;
  if (aiOcrEnabled()) {
    ai = await analyzeInvoiceWithAi(
      imageBase64,
      options,
      preparedText || undefined,
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
      source: pickInvoiceSource(ai, localDraft, merged),
      memoryApplied,
      memoryScanCount: memoryCtx.scanCount,
    };
  }

  return {
    invoice: merged,
    source: pickInvoiceSource(ai, localDraft, merged),
    memoryApplied: false,
    memoryScanCount: 0,
  };
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
  const text = await resolveOcrText(imageBase64, ocrText?.trim() || null, "receipt");

  const roughDraft = text ? parseReceiptFromText(text) : emptyReceipt();
  let vendorHint = roughDraft.vendor?.trim() || "";

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
        layoutHints: {},
        promptBlock: "",
      };

  const preparedText = text ? prepareOcrTextForParsing(text, memoryCtx) : "";
  const localDraft = preparedText ? parseReceiptFromText(preparedText) : emptyReceipt();

  let ai: ReceiptData | null = null;
  if (aiOcrEnabled()) {
    ai = await analyzeReceiptWithAi(
      imageBase64,
      options,
      preparedText || undefined,
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
      source: pickReceiptSource(ai, localDraft, merged),
      memoryApplied,
      memoryScanCount: memoryCtx.scanCount,
    };
  }

  return {
    receipt: merged,
    source: pickReceiptSource(ai, localDraft, merged),
    memoryApplied: false,
    memoryScanCount: 0,
  };
}
