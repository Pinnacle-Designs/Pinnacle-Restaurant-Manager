import type { VendorOcrContext } from "./vendor-memory";

const SKU_TOKEN = /\b([A-Z]{2,5}(?:\d+[A-Z0-9OIL]*|[A-Z0-9OIL]*\d+))\b/g;

/** Normalize distributor item codes (TOFU1O → TOFU10, FENBAO1 → FENBA01). */
export function normalizeSkuLikeToken(token: string): string {
  const upper = token.trim().toUpperCase();
  if (!/^[A-Z]{2,6}[A-Z0-9OIL]{2,6}$/.test(upper)) return upper;

  const candidates = new Set<string>([upper]);
  const base = upper.replace(/[OIL]/g, (ch) => (ch === "O" ? "0" : "1"));
  candidates.add(base);

  if (/[OIL]$/.test(upper)) {
    candidates.add(`${upper.slice(0, -1)}0`);
    candidates.add(`${upper.slice(0, -1)}1`);
  }

  const digitTail = upper.match(/^([A-Z]{2,5})(\d+)[OIL]$/);
  if (digitTail) {
    candidates.add(`${digitTail[1]}${digitTail[2]}0`);
  }

  const digitMid = upper.match(/^([A-Z]{2,5})[OIL](\d+)$/);
  if (digitMid) {
    candidates.add(`${digitMid[1]}0${digitMid[2]}`);
  }

  for (const candidate of candidates) {
    if (/^[A-Z]{2,6}\d{2,4}$/.test(candidate)) return candidate;
  }

  return upper;
}

function fixSkuTokens(text: string): string {
  return text.replace(SKU_TOKEN, (match) => normalizeSkuLikeToken(match));
}

/** Fix letter/digit confusions only in numeric price/qty contexts. */
function fixNumericOcrErrors(text: string): string {
  return text
    .replace(/(\d)[Oo](\d)/g, "$10$2")
    .replace(/(\d)[lI](\d)/g, "$11$2")
    .replace(/(\d),(\d{2})(?=\s|$)/g, "$1.$2")
    .replace(/(\d{1,3})\s+(\d{2})(?=\s|$)/g, (match, a, b) => {
      if (parseInt(b, 10) >= 60) return match;
      return `${a}.${b}`;
    })
    .replace(/(\d),(\d{3})\.(\d{2})/g, "$1$2.$3");
}

const COMMON_OCR_SWAPS: Array<[RegExp, string]> = [
  [/\bTota1\b/gi, "Total"],
  [/\blnvoice\b/gi, "Invoice"],
  [/\bAm0unt\b/gi, "Amount"],
  [/\bEacn\b/gi, "Each"],
  [/\bBrocc0li\b/gi, "Broccoli"],
  [/\bFenne1\b/gi, "Fennel"],
  [/\bEggp1ant\b/gi, "Eggplant"],
  [/\bT0FU\b/gi, "TOFU"],
  [/\bSui\s*Choy\b/gi, "Sui Choy"],
  [/\bManufacturers?\b/gi, "Manufacturers"],
  [/\bIs1ands\b/gi, "Islands"],
  [/\bB00M\b/gi, "BOOM"],
  [/\bBATTEN\b/gi, "BATTEN"],
  [/\bQty\s*0rdered\b/gi, "Qty Ordered"],
  [/\bQty\s*Shipped\b/gi, "Qty Shipped"],
  [/\bExt(?:ended)?\s*Pr(?:ice)?\b/gi, "Extended Price"],
  [/\bUnit\s*Pr(?:ice)?\b/gi, "Unit Price"],
  [/\b1\/\#/g, "1/#"],
  [/\s{3,}/g, "  "],
];

/** Fix frequent Tesseract confusions before field parsing. */
export function fixCommonOcrErrors(text: string): string {
  let next = fixSkuTokens(fixNumericOcrErrors(text));
  for (const [pattern, replacement] of COMMON_OCR_SWAPS) {
    next = next.replace(pattern, replacement);
  }
  return next;
}

/** Apply learned vendor aliases to raw OCR text before parsing. */
export function applyAliasesToOcrText(text: string, ctx?: Pick<VendorOcrContext, "aliases" | "displayName">): string {
  if (!ctx?.aliases?.length) return text;

  let next = text;
  for (const alias of ctx.aliases.filter((a) => a.field === "vendor")) {
    if (!alias.ocrValue || alias.ocrValue.length < 4) continue;
    const re = new RegExp(alias.ocrValue.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    next = next.replace(re, alias.correctedValue);
  }

  for (const alias of ctx.aliases.filter((a) => a.field === "description")) {
    const ocr = alias.ocrValue.includes("|") ? alias.ocrValue.split("|")[1] : alias.ocrValue;
    if (!ocr || ocr.length < 5) continue;
    const re = new RegExp(ocr.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    next = next.replace(re, alias.correctedValue);
  }

  return next;
}

export function prepareOcrTextForParsing(
  rawText: string,
  ctx?: Pick<VendorOcrContext, "aliases" | "displayName">
): string {
  return applyAliasesToOcrText(fixCommonOcrErrors(rawText), ctx);
}
