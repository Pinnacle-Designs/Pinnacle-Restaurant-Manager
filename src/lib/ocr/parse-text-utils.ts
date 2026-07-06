/** Shared heuristics for parsing OCR plain text into structured fields. */

export function parseMoney(value: string): number {
  const n = parseFloat(value.replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

export function extractTotalAmount(text: string): number {
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    if (/^(?:total|amount\s+due|balance\s+due|grand\s+total|invoice\s+total)/i.test(line.trim())) {
      const match = line.match(/([\d,]+\.\d{2})/);
      if (match) return parseMoney(match[1]!);
    }
  }

  const amounts = [...text.matchAll(/(?:^|\s|\$)([\d,]+\.\d{2})(?:\s|$)/gm)]
    .map((m) => parseMoney(m[1]!))
    .filter((n) => n > 0 && n < 250_000);

  return amounts.length ? Math.max(...amounts) : 0;
}

export function extractDocumentDate(text: string): string {
  const iso = text.match(/\b(20\d{2})[-/](\d{1,2})[-/](\d{1,2})\b/);
  if (iso) {
    return `${iso[1]}-${iso[2]!.padStart(2, "0")}-${iso[3]!.padStart(2, "0")}`;
  }

  const us = text.match(/\b(\d{1,2})[/-](\d{1,2})[/-]((?:20)?\d{2})\b/);
  if (us) {
    let year = us[3]!;
    if (year.length === 2) year = `20${year}`;
    return `${year}-${us[1]!.padStart(2, "0")}-${us[2]!.padStart(2, "0")}`;
  }

  return new Date().toISOString().split("T")[0]!;
}

export function extractInvoiceNumber(text: string): string {
  const match = text.match(
    /(?:invoice\s*(?:#|no\.?|number)?|inv\.?\s*#?)\s*[:#]?\s*([A-Z0-9][A-Z0-9-]{2,})/i
  );
  return match?.[1]?.trim() ?? "";
}

export function extractVendorName(text: string): string {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 1);

  const skip =
    /^(invoice|receipt|bill\s*to|ship\s*to|sold\s*to|date|page\s+\d|tel|phone|fax|www\.|http)/i;

  for (const line of lines.slice(0, 10)) {
    if (line.length > 60 || skip.test(line) || /^[\d$.,\s]+$/.test(line)) continue;
    if (/^[^a-zA-Z]*$/.test(line)) continue;
    return line;
  }

  return "";
}

export function normalizeOcrText(text: string): string {
  return text
    .replace(/\u2018|\u2019/g, "'")
    .replace(/\u201c|\u201d/g, '"')
    .replace(/[|]/g, "I")
    .replace(/\s+/g, " ")
    .trim();
}
