import type { ReceiptData } from "@/lib/ai";
import {
  extractDocumentDate,
  extractTotalAmount,
  extractVendorName,
  normalizeOcrText,
} from "./parse-text-utils";

const CATEGORY_KEYWORDS: Array<{ pattern: RegExp; category: string }> = [
  { pattern: /electric|gas\s+company|water\s+sewer|utility/i, category: "Utilities" },
  { pattern: /repair|plumb|hvac|maintenance/i, category: "Maintenance" },
  { pattern: /payroll|staffing|labor/i, category: "Labor" },
  { pattern: /market|advert|facebook|google\s+ads/i, category: "Marketing" },
  { pattern: /equipment|supplies\s+depot|restaurant\s+depot/i, category: "Equipment" },
  { pattern: /insurance|liability/i, category: "Insurance" },
  { pattern: /food|grocery|restaurant|sysco|us\s*foods|produce|meat|seafood/i, category: "Food & Supplies" },
];

function guessCategory(text: string, vendor: string): string {
  const haystack = `${vendor} ${text}`.toLowerCase();
  for (const { pattern, category } of CATEGORY_KEYWORDS) {
    if (pattern.test(haystack)) return category;
  }
  return "Food & Supplies";
}

function parseReceiptItems(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((line) => {
      if (line.length < 3 || line.length > 120) return false;
      if (/^(total|subtotal|tax|change|cash|visa|mastercard|auth|thank)/i.test(line)) return false;
      return /[\d,]+\.\d{2}/.test(line) || /^[A-Za-z].{2,}/.test(line);
    })
    .slice(0, 40);
}

export function parseReceiptFromText(rawText: string): ReceiptData {
  const text = normalizeOcrText(rawText);
  const vendor = extractVendorName(text);
  const amount = extractTotalAmount(text);
  const date = extractDocumentDate(text);
  const items = parseReceiptItems(text);
  const category = guessCategory(text, vendor);

  return {
    vendor: vendor || "Unknown vendor",
    amount,
    date,
    category,
    description: vendor ? `${vendor} receipt` : "Receipt expense",
    items,
  };
}

export function hasUsefulReceiptData(data: ReceiptData): boolean {
  return Boolean(data.vendor?.trim() && data.vendor !== "Unknown vendor") || data.amount > 0 || data.items.length > 0;
}

export function mergeReceiptData(...sources: ReceiptData[]): ReceiptData {
  const usable = sources.filter(Boolean);
  const today = new Date().toISOString().split("T")[0]!;
  if (!usable.length) {
    return {
      description: "Receipt expense",
      amount: 0,
      category: "Food & Supplies",
      date: today,
      vendor: "",
      items: [],
    };
  }
  if (usable.length === 1) return usable[0]!;

  const vendor =
    usable
      .map((s) => s.vendor?.trim())
      .find((v) => v && !/^unknown/i.test(v)) ?? usable[0]!.vendor;

  const amounts = usable.map((s) => s.amount).filter((a) => a > 0);
  const amount = amounts.length ? Math.max(...amounts) : usable[0]!.amount;

  const items = usable.reduce(
    (longest, s) => (s.items.length > longest.length ? s.items : longest),
    [] as string[]
  );

  const category =
    usable.map((s) => s.category).find((c) => c && c !== "Food & Supplies") ?? usable[0]!.category;

  const description =
    usable
      .map((s) => s.description?.trim())
      .find((d) => d && !/^receipt expense$/i.test(d)) ??
    (vendor ? `${vendor} receipt` : usable[0]!.description);

  const date = usable.find((s) => s.date && s.date !== today)?.date ?? usable[0]!.date;

  return { vendor, amount, category, description, date, items };
}
