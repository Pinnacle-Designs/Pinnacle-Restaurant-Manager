import type { InvoiceData, InvoiceLineData } from "@/lib/ai/analyze-invoice";
import {
  extractDocumentDate,
  extractInvoiceNumber,
  extractTotalAmount,
  extractVendorName,
  normalizeOcrText,
  parseMoney,
} from "./parse-text-utils";

function parseLineItems(text: string): InvoiceLineData[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const items: InvoiceLineData[] = [];

  for (const line of lines) {
    if (/^(total|subtotal|tax|invoice|ship|bill|balance|amount|page\s+\d)/i.test(line)) {
      continue;
    }

    const priceMatch = line.match(/([\d,]+\.\d{2})\s*$/);
    if (!priceMatch) continue;

    const lineTotal = parseMoney(priceMatch[1]!);
    if (lineTotal <= 0 || lineTotal > 50_000) continue;

    let rest = line.slice(0, line.length - priceMatch[0].length).trim();
    let qty = 1;
    let unit = "each";

    const qtyUnitMatch = rest.match(
      /(\d+(?:\.\d+)?)\s*(case|cs|cases|ea|each|lb|lbs|oz|gal|ct|pk|box)\.?\s*$/i
    );
    if (qtyUnitMatch) {
      qty = parseFloat(qtyUnitMatch[1]!);
      unit = qtyUnitMatch[2]!.toLowerCase().replace(/^cs$|^cases$|^case$/, "case");
      rest = rest.slice(0, rest.length - qtyUnitMatch[0].length).trim();
    }

    const unitPriceMatch = rest.match(/([\d,]+\.\d{2,4})\s*$/);
    let unitPrice = qty > 0 ? lineTotal / qty : lineTotal;
    if (unitPriceMatch) {
      unitPrice = parseMoney(unitPriceMatch[1]!);
      rest = rest.slice(0, rest.length - unitPriceMatch[0].length).trim();
    }

    const description = rest.replace(/\s{2,}/g, " ").trim();
    if (description.length < 2) continue;

    items.push({
      description,
      qty: qty || 1,
      unit,
      unitPrice,
      lineTotal,
    });
  }

  return items.slice(0, 60);
}

export function parseInvoiceFromText(rawText: string): InvoiceData {
  const text = normalizeOcrText(rawText);
  const lines = parseLineItems(text);
  const amount = extractTotalAmount(text) || lines.reduce((sum, l) => sum + l.lineTotal, 0);

  return {
    vendor: extractVendorName(text),
    invoiceNumber: extractInvoiceNumber(text),
    amount,
    invoiceDate: extractDocumentDate(text),
    lines,
  };
}

export function hasUsefulInvoiceData(data: InvoiceData): boolean {
  return Boolean(data.vendor?.trim()) || data.lines.length > 0 || data.amount > 0;
}
