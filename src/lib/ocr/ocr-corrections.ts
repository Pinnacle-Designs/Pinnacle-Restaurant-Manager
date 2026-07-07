import type { VendorOcrContext } from "./vendor-memory";

const COMMON_OCR_SWAPS: Array<[RegExp, string]> = [
  [/\bO(\d)/g, "0$1"],
  [/\bI(\d)/g, "1$1"],
  [/\bl(\d)/g, "1$1"],
  [/\bS(\d+\.\d{2})\b/g, "5$1"],
  [/(\d),(\d{3})\.(\d{2})/g, "$1$2.$3"],
  [/\bTota1\b/gi, "Total"],
  [/\blnvoice\b/gi, "Invoice"],
  [/\bAm0unt\b/gi, "Amount"],
  [/\bEacn\b/gi, "Each"],
  [/\bBrocc0li\b/gi, "Broccoli"],
  [/\bFenne1\b/gi, "Fennel"],
  [/\bEggp1ant\b/gi, "Eggplant"],
  [/\bCabbage\b/gi, "Cabbage"],
  [/\bSui\s*Choy\b/gi, "Sui Choy"],
  [/\bManufacturers?\b/gi, "Manufacturers"],
  [/\bIs1ands\b/gi, "Islands"],
  [/\bB00M\b/gi, "BOOM"],
  [/\bBATTEN\b/gi, "BATTEN"],
  [/\s{3,}/g, "  "],
];

/** Fix frequent Tesseract confusions before field parsing. */
export function fixCommonOcrErrors(text: string): string {
  let next = text;
  for (const [pattern, replacement] of COMMON_OCR_SWAPS) {
    next = next.replace(pattern, replacement);
  }
  return next;
}

function normalizeAliasKey(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

/** Apply learned vendor aliases to raw OCR text before parsing. */
export function applyAliasesToOcrText(text: string, ctx?: Pick<VendorOcrContext, "aliases" | "displayName">): string {
  if (!ctx?.aliases?.length && !ctx?.displayName) return text;

  let next = text;
  for (const alias of ctx.aliases.filter((a) => a.field === "vendor")) {
    if (!alias.ocrValue || alias.ocrValue.length < 3) continue;
    const re = new RegExp(alias.ocrValue.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    next = next.replace(re, alias.correctedValue);
  }

  for (const alias of ctx.aliases.filter((a) => a.field === "description")) {
    const ocr = alias.ocrValue.includes("|") ? alias.ocrValue.split("|")[1] : alias.ocrValue;
    if (!ocr || ocr.length < 4) continue;
    const re = new RegExp(ocr.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    next = next.replace(re, alias.correctedValue);
  }

  if (ctx.displayName) {
    const key = normalizeAliasKey(ctx.displayName);
    const firstWord = key.split(" ")[0];
    if (firstWord && firstWord.length >= 4) {
      const garbled = new RegExp(`\\b${firstWord.slice(0, 4)}[a-z0-9]{0,8}\\b`, "i");
      if (garbled.test(next) && !next.toLowerCase().includes(key.slice(0, 8))) {
        next = next.replace(garbled, ctx.displayName.split(" ")[0]!);
      }
    }
  }

  return next;
}

export function prepareOcrTextForParsing(
  rawText: string,
  ctx?: Pick<VendorOcrContext, "aliases" | "displayName">
): string {
  return applyAliasesToOcrText(fixCommonOcrErrors(rawText), ctx);
}
