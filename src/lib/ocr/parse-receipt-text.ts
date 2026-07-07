import type { ReceiptData } from "@/lib/ai";
import {
  extractDocumentDate,
  extractTotalAmount,
  extractVendorName,
  normalizeOcrText,
  parseMoney,
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

const RECEIPT_SKIP =
  /^(?:total|sub\s*total|subtotal|tax|change|cash|visa|mastercard|debit|auth|thank|balance|amount\s+due|gratuity|tip|approved|transaction|card|merchant|terminal)/i;

function guessCategory(text: string, vendor: string): string {
  const haystack = `${vendor} ${text}`.toLowerCase();
  for (const { pattern, category } of CATEGORY_KEYWORDS) {
    if (pattern.test(haystack)) return category;
  }
  return "Food & Supplies";
}

function parseReceiptLineItem(line: string): string | null {
  const trimmed = line.trim();
  if (trimmed.length < 3 || trimmed.length > 120) return null;
  if (RECEIPT_SKIP.test(trimmed)) return null;

  const trailingPrice = trimmed.match(/^(.+?)\s+\$?\s*([\d,]+\.\d{2})\s*$/);
  if (trailingPrice) {
    const name = trailingPrice[1]!.trim();
    const price = parseMoney(trailingPrice[2]!);
    if (name.length >= 2 && price > 0 && price < 10_000) {
      return `${name} — $${price.toFixed(2)}`;
    }
  }

  if (/[\d,]+\.\d{2}/.test(trimmed) && /[A-Za-z]{2,}/.test(trimmed)) {
    return trimmed;
  }

  if (/^[A-Za-z].{2,}$/.test(trimmed)) return trimmed;
  return null;
}

function parseReceiptItems(text: string): string[] {
  const items: string[] = [];
  const seen = new Set<string>();

  for (const line of text.split(/\r?\n/)) {
    const item = parseReceiptLineItem(line);
    if (!item) continue;
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    items.push(item);
  }

  return items.slice(0, 40);
}

export function scoreReceiptData(data: ReceiptData): number {
  let score = 0;
  if (data.vendor?.trim() && data.vendor !== "Unknown vendor") score += 4;
  if (data.amount > 0) score += 4;
  score += Math.min(data.items.length, 20) * 2;
  if (data.description && !/^receipt expense$/i.test(data.description)) score += 2;
  return score;
}

export function parseReceiptFromText(rawText: string): ReceiptData {
  const text = normalizeOcrText(rawText);
  const vendor = extractVendorName(text);
  const items = parseReceiptItems(text);
  const amount = extractTotalAmount(text, { lineItemCount: items.length });
  const date = extractDocumentDate(text);
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
  return (
    Boolean(data.vendor?.trim() && data.vendor !== "Unknown vendor") ||
    data.amount > 0 ||
    data.items.length > 0
  );
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

  const ranked = [...usable].sort((a, b) => scoreReceiptData(b) - scoreReceiptData(a));
  const best = ranked[0]!;

  const vendor =
    usable
      .map((s) => s.vendor?.trim())
      .find((v) => v && !/^unknown/i.test(v)) ?? best.vendor;

  const amounts = usable.map((s) => s.amount).filter((a) => a > 0);
  const amount = amounts.length ? Math.max(...amounts) : best.amount;

  const items = usable.reduce(
    (longest, s) => (s.items.length > longest.length ? s.items : longest),
    [] as string[]
  );

  const category =
    usable.map((s) => s.category).find((c) => c && c !== "Food & Supplies") ?? best.category;

  const description =
    usable
      .map((s) => s.description?.trim())
      .find((d) => d && !/^receipt expense$/i.test(d)) ??
    (vendor ? `${vendor} receipt` : best.description);

  const date = usable.find((s) => s.date && s.date !== today)?.date ?? best.date;

  return { vendor, amount, category, description, date, items };
}
