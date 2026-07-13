/** Shared heuristics for parsing OCR plain text into structured fields. */

export function parseMoney(value: string): number {
  const n = parseFloat(value.replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

const TOTAL_LABELS: Array<{ pattern: RegExp; weight: number }> = [
  { pattern: /(?:total\s+invoice|invoice\s+total)/i, weight: 100 },
  { pattern: /(?:grand\s+total|order\s+total)/i, weight: 90 },
  { pattern: /(?:amount\s+due|balance\s+due|total\s+due)/i, weight: 80 },
  { pattern: /(?:sub\s*total|subtotal)/i, weight: 70 },
  { pattern: /(?:total|net\s+amount)/i, weight: 50 },
];

function amountsNearLabel(text: string, label: RegExp): number[] {
  const amounts: number[] = [];
  const re = new RegExp(
    `${label.source}[^\\d$]{0,24}\\$?\\s*([\\d,]+\\.\\d{2})`,
    label.flags.includes("i") ? "gi" : "g"
  );
  for (const match of text.matchAll(re)) {
    const value = parseMoney(match[1]!);
    if (value > 0 && value < 250_000) amounts.push(value);
  }
  return amounts;
}

export function extractTotalAmount(text: string, opts?: { totalLabel?: string; lineItemCount?: number }): number {
  const lines = text.split(/\r?\n/);

  if (opts?.totalLabel) {
    const custom = new RegExp(
      `${opts.totalLabel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[^\\d$]{0,24}\\$?\\s*([\\d,]+\\.\\d{2})`,
      "i"
    );
    const match = text.match(custom);
    if (match?.[1]) {
      const value = parseMoney(match[1]);
      if (value > 0) return value;
    }
  }

  for (const { pattern } of TOTAL_LABELS) {
    for (const line of lines) {
      if (!pattern.test(line)) continue;
      const amounts = [...line.matchAll(/([\d,]+\.\d{2})/g)].map((m) => parseMoney(m[1]!));
      if (amounts.length) return amounts[amounts.length - 1]!;
    }
  }

  let best = 0;
  let bestWeight = 0;
  for (const { pattern, weight } of TOTAL_LABELS) {
    for (const value of amountsNearLabel(text, pattern)) {
      if (weight > bestWeight || (weight === bestWeight && value > best)) {
        best = value;
        bestWeight = weight;
      }
    }
  }
  if (best > 0) return best;

  const footerStart = Math.max(0, Math.floor(lines.length * 0.7));
  const footerText = lines.slice(footerStart).join("\n");
  const footerAmounts = [...footerText.matchAll(/(?:^|\s|\$)([\d,]+\.\d{2})(?:\s|$)/gm)]
    .map((m) => parseMoney(m[1]!))
    .filter((n) => n > 0 && n < 250_000);
  if (footerAmounts.length) {
    const counts = new Map<number, number>();
    for (const amount of footerAmounts) counts.set(amount, (counts.get(amount) ?? 0) + 1);
    const repeated = [...counts.entries()].filter(([, c]) => c >= 2).map(([a]) => a);
    if (repeated.length) return Math.max(...repeated);
    return Math.max(...footerAmounts);
  }

  // Avoid picking unit prices from the line-item body when many rows exist.
  const bodyEnd = opts?.lineItemCount && opts.lineItemCount >= 2
    ? Math.max(0, Math.floor(lines.length * 0.65))
    : lines.length;
  const bodyText = lines.slice(0, bodyEnd).join("\n");
  const bodyAmounts = [...bodyText.matchAll(/(?:^|\s|\$)([\d,]+\.\d{2})(?:\s|$)/gm)]
    .map((m) => parseMoney(m[1]!))
    .filter((n) => n > 0 && n < 250_000);

  if (bodyAmounts.length && (!opts?.lineItemCount || opts.lineItemCount < 2)) {
    const skuLines = lines.filter((l) => /\b[A-Z]{2,6}\d{2,4}\b/.test(l));
    if (skuLines.length >= 1 && bodyAmounts.length >= 2) {
      const extendedCandidates = bodyAmounts.filter((amount) => {
        const hits = bodyAmounts.filter((other) => Math.abs(other - amount) < 0.01).length;
        return hits === 1 && amount >= 20;
      });
      if (extendedCandidates.length) return Math.max(...extendedCandidates);
    }
    if (bodyAmounts.length === 1 && skuLines.length >= 1) {
      return 0;
    }
    return Math.max(...bodyAmounts);
  }

  return 0;
}

const MONTH_TOKEN: Record<string, string> = {
  jan: "01",
  january: "01",
  feb: "02",
  february: "02",
  mar: "03",
  march: "03",
  apr: "04",
  april: "04",
  may: "05",
  jun: "06",
  june: "06",
  jul: "07",
  july: "07",
  aug: "08",
  august: "08",
  sep: "09",
  sept: "09",
  september: "09",
  oct: "10",
  october: "10",
  nov: "11",
  november: "11",
  dec: "12",
  december: "12",
};

function normalizeYear(year: string): string {
  if (year.length === 2) return `20${year}`;
  return year;
}

/** Build YYYY-MM-DD from numeric month/day with slash-date ambiguity handling. */
function composeIsoDate(monthRaw: string, dayRaw: string, yearRaw: string, preferDayFirst = false): string {
  let month = parseInt(monthRaw, 10);
  let day = parseInt(dayRaw, 10);
  const year = normalizeYear(yearRaw);

  if (month > 12 && day <= 12) {
    [month, day] = [day, month];
  } else if (day > 12 && month <= 12) {
    // month-first already
  } else if (month <= 12 && day <= 12 && preferDayFirst) {
    [month, day] = [day, month];
  }

  if (month < 1 || month > 12 || day < 1 || day > 31) return "";
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseMonthNameDate(dayRaw: string, monthToken: string, yearRaw: string): string {
  const month = MONTH_TOKEN[monthToken.toLowerCase()];
  if (!month) return "";
  const day = parseInt(dayRaw, 10);
  const year = normalizeYear(yearRaw);
  if (day < 1 || day > 31) return "";
  return `${year}-${month}-${String(day).padStart(2, "0")}`;
}

function inferPreferDayFirst(text: string, vendor?: string): boolean {
  const probe = `${vendor ?? ""}\n${text.slice(0, 600)}`;
  return /canada|\.C\.|\bBC\b|\bAB\b|\bON\b|\bQC\b|victoria|toronto|calgary|montreal|manufacturers?\s+ltd/i.test(
    probe
  );
}

/** Remove date fragments that OCR sometimes merges into product descriptions. */
export function stripEmbeddedDates(text: string): string {
  return text
    .replace(
      /\b(?:invoice|order)\s+date[:\s]*\d{1,2}[\/\-.]\d{1,2}[\/\-.](?:20)?\d{2,4}\b/gi,
      " "
    )
    .replace(
      /\b\d{1,2}[\/\-.]\d{1,2}[\/\-.](?:20)?\d{2,4}\b/g,
      " "
    )
    .replace(
      /\b\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+(?:20)?\d{2,4}\b/gi,
      " "
    )
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function extractDocumentDate(text: string, opts?: { vendor?: string }): string {
  const headerLines = text.split(/\r?\n/).slice(0, 30);
  const header = headerLines.join("\n");
  const preferDayFirst = inferPreferDayFirst(text, opts?.vendor);

  const invoiceSlash = header.match(
    /invoice\s+date[:\s]+(\d{1,2})[\/\-.](\d{1,2})[\/\-.]((?:20)?\d{2,4})/i
  );
  if (invoiceSlash) {
    const iso = composeIsoDate(invoiceSlash[1]!, invoiceSlash[2]!, invoiceSlash[3]!, preferDayFirst);
    if (iso) return iso;
  }

  const invoiceNamed = header.match(
    /invoice\s+date[:\s]+(\d{1,2})[\s\-\/]([A-Za-z]{3,9})[\s\-\/]((?:20)?\d{2,4})/i
  );
  if (invoiceNamed) {
    const iso = parseMonthNameDate(invoiceNamed[1]!, invoiceNamed[2]!, invoiceNamed[3]!);
    if (iso) return iso;
  }

  const labeled = header.match(
    /(?:^|\b)(?:date)[:\s]+(\d{1,2})[\/\-.](\d{1,2})[\/\-.]((?:20)?\d{2,4})/im
  );
  if (labeled) {
    const iso = composeIsoDate(labeled[1]!, labeled[2]!, labeled[3]!, preferDayFirst);
    if (iso) return iso;
  }

  const orderSlash = header.match(
    /order\s+date[:\s]+(\d{1,2})[\/\-.](\d{1,2})[\/\-.]((?:20)?\d{2,4})/i
  );
  if (orderSlash) {
    const iso = composeIsoDate(orderSlash[1]!, orderSlash[2]!, orderSlash[3]!, preferDayFirst);
    if (iso) return iso;
  }

  const iso = header.match(/\b(20\d{2})[-/](\d{1,2})[-/](\d{1,2})\b/);
  if (iso) {
    return `${iso[1]}-${iso[2]!.padStart(2, "0")}-${iso[3]!.padStart(2, "0")}`;
  }

  const named = header.match(
    /\b(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.?,?\s+((?:20)?\d{2,4})\b/i
  );
  if (named) {
    const parsed = parseMonthNameDate(named[1]!, named[2]!, named[3]!);
    if (parsed) return parsed;
  }

  const us = header.match(/\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.]((?:20)?\d{2,4})\b/);
  if (us) {
    const parsed = composeIsoDate(us[1]!, us[2]!, us[3]!, preferDayFirst);
    if (parsed) return parsed;
  }

  return new Date().toISOString().split("T")[0]!;
}

export function extractInvoiceNumber(text: string): string {
  const header = text.split(/\r?\n/).slice(0, 25).join("\n");

  const patterns = [
    /(?:invoice\s*(?:#|no\.?|number)?|inv\.?\s*#?)\s*[:#]?\s*([A-Z0-9][A-Z0-9-]{4,})/i,
    /(?:invoice\s*(?:#|no\.?|number)?|inv\.?\s*#?)\s*[:#]?\s*(\d{6,10})/i,
    /\binvoice\s+(\d{6,10})\b/i,
    /\bour\s+order\s+(?:#|no\.?|number)?\s*[:#]?\s*(\d{6,10})/i,
  ];
  for (const pattern of patterns) {
    const match = header.match(pattern);
    if (match?.[1]) return match[1].trim();
  }

  const nearInvoice = header.match(
    /(?<!total\s)(?<!sub\s)invoice[^\d]{0,20}(\d{6,10})/i
  );
  if (nearInvoice?.[1]) return nearInvoice[1];

  const standalone = header.match(/\b(\d{7,10})\b/);
  if (standalone?.[1]) return standalone[1];

  return "";
}

const COMPANY_SUFFIX =
  /\b(?:Ltd\.?|Limited|LLC|L\.L\.C\.|Inc\.?|Incorporated|Corp\.?|Corporation|Co\.|Company|Manufacturers?|Distributors?|Wholesale|Foods?|Produce|Supply|Services?)\b/i;

const SKIP_LINE =
  /^(?:invoice|receipt|bill\s*to|ship\s*to|sold\s*to|deliver\s*to|date|page\s+\d|tel|phone|fax|www\.|http|route|customer|terms|purchase\s+order|salesperson|order\s+date|item\s+number|article|qty|quantity|extended|unit\s+price|package|special\s+instructions|authorization|paid\s+amount|amount\s+due|subtotal|tax|total|all\s+claims|all\s+prices|customer\s+original)/i;

const SKU_LIKE_LINE = /\b[A-Z]{2,6}\d{2,4}\b/;
const MONEY_LIKE_LINE = /[\d,]+\.\d{2}/;

const PRODUCT_LINE =
  /\b(?:TOFU|CABBAGE|BROCCOLI|FENNEL|CHICKEN|BEEF|BRISKET|EGGPLANT|PORK|LAMB|SALMON|SHRIMP|RICE|PASTA|CHEESE|BUTTER|CREAM|MILK|LETTUCE|TOMATO|ONION|POTATO|CARROT|PEPPER|MUSHROOM|SPINACH|KALE|ARUGULA)\b/i;

export function extractVendorName(text: string): string {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 1);

  const isVendorCandidate = (line: string): boolean => {
    if (line.length > 80 || SKIP_LINE.test(line) || /^[\d$.,\s]+$/.test(line)) return false;
    if (/^[^a-zA-Z]*$/.test(line)) return false;
    if (SKU_LIKE_LINE.test(line) && MONEY_LIKE_LINE.test(line)) return false;
    if (/^\b[A-Z]{2,6}\d{2,4}\b(?:\s|$)/.test(line) && !COMPANY_SUFFIX.test(line)) return false;
    if (PRODUCT_LINE.test(line) && !COMPANY_SUFFIX.test(line) && line.length < 50) return false;
    return true;
  };

  for (const line of lines.slice(0, 20)) {
    if (!isVendorCandidate(line)) continue;
    if (COMPANY_SUFFIX.test(line)) return line.replace(/\s{2,}/g, " ").trim();
  }

  for (const line of lines.slice(0, 20)) {
    if (!isVendorCandidate(line)) continue;
    if (/\b(?:street|st\.|avenue|ave\.|road|rd\.|boulevard|blvd\.|drive|dr\.|suite|ste\.)\b/i.test(line)) {
      continue;
    }
    if (line.length >= 4 && line.length <= 60) return line.replace(/\s{2,}/g, " ").trim();
  }

  const inline = text.match(
    new RegExp(
      `([A-Z][A-Za-z0-9&'.\\- ]{2,60}${COMPANY_SUFFIX.source.slice(1, -2)})\\.?`,
      "i"
    )
  );
  return inline?.[1]?.replace(/\s{2,}/g, " ").trim() ?? "";
}

/** Normalize OCR text while preserving line breaks and tab columns. */
export function normalizeOcrText(text: string): string {
  return text
    .replace(/\u2018|\u2019/g, "'")
    .replace(/\u201c|\u201d/g, '"')
    .replace(/[|]/g, "I")
    .split(/\r?\n/)
    .map((line) => {
      if (line.includes("\t")) {
        return line
          .split("\t")
          .map((part) => part.replace(/\s+/g, " ").trim())
          .filter(Boolean)
          .join("\t");
      }
      return line.replace(/\s+/g, " ").trim();
    })
    .filter(Boolean)
    .join("\n")
    .trim();
}
