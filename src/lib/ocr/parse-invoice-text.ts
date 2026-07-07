import type { InvoiceData, InvoiceLineData } from "@/lib/ai/analyze-invoice";
import type { SkuLineHint } from "./vendor-memory";
import {
  extractDocumentDate,
  extractInvoiceNumber,
  extractTotalAmount,
  extractVendorName,
  normalizeOcrText,
  parseMoney,
} from "./parse-text-utils";

export interface InvoiceParseContext {
  itemCodePattern?: string;
  totalLabel?: string;
  skuHints?: SkuLineHint[];
}

const DEFAULT_ITEM_CODE = /^([A-Z]{2,6}\d{2,4})\b/;

const SKIP_LINE =
  /^(?:total|subtotal|sub\s*total|tax|invoice|ship|bill|balance|amount|page\s+\d|route|customer|terms|purchase|salesperson|order\s+date|our\s+order|item\s+number|article|qty|quantity|extended|unit\s+price|package|special|authorization|paid|minimum\s+order|all\s+claims|all\s+prices|customer\s+original)/i;

const PACKAGE_PATTERN =
  /\b(\d+\s*#?\/?\s*(?:bag|case|cas|cs|lb|lbs|oz|gal|ct|pk|box|ea|each)|(?:case|cas|cs|each|ea|lb|lbs))\b/i;

function itemCodeRegex(ctx?: InvoiceParseContext): RegExp {
  if (ctx?.itemCodePattern) {
    try {
      return new RegExp(`(${ctx.itemCodePattern})\\b`);
    } catch {
      /* invalid learned pattern */
    }
  }
  return DEFAULT_ITEM_CODE;
}

function expandOcrLines(text: string, itemCode: RegExp): string[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length > 3) return lines;

  const splitPattern = new RegExp(`(?=${itemCode.source.replace(/^\^?\(?/, "").replace(/\)?\\b$/, "")}\\b)`);
  const split = text.split(splitPattern).map((l) => l.trim()).filter(Boolean);
  return split.length > lines.length ? split : lines;
}

function parseCatchWeight(line: string): { billed?: number; unit?: string } {
  const match = line.match(/\b(\d+(?:\.\d+)?)\s*(LB|LBS|KG|KGS)\b/i);
  if (!match) return {};
  const billed = parseFloat(match[1]!);
  if (!Number.isFinite(billed) || billed <= 0 || billed > 9999) return {};
  return { billed, unit: match[2]!.toLowerCase().startsWith("kg") ? "kg" : "lbs" };
}

function parseQtyFromLine(beforePrices: string, description: string, sku?: string): number {
  let segment = beforePrices;
  if (sku) segment = segment.replace(sku, "");
  segment = segment.replace(description, "");
  segment = segment
    .replace(/\d+\s*#\/\w+/gi, " ")
    .replace(/\d+\s*\/\s*\d+\s*#/gi, " ")
    .replace(/\b\d+\s*CT\b/gi, " ")
    .replace(/\b\d+\/\d+#/gi, " ");

  const pair = segment.match(
    /(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(?:EACH|EA|CASE|CAS|CS|LB|LBS|BAG|PK|BOX|\d+(?:\s*\/\s*\d+)?\s*#)/i
  );
  if (pair) {
    const shipped = parseFloat(pair[2]!);
    const ordered = parseFloat(pair[1]!);
    if (shipped > 0 && shipped <= 9999) return shipped;
    if (ordered > 0 && ordered <= 9999) return ordered;
  }

  const single = segment.match(
    /(\d+(?:\.\d+)?)\s+(?:EACH|EA|CASE|CAS|CS|LB|LBS|BAG|PK|BOX)\b/i
  );
  if (single) {
    const qty = parseFloat(single[1]!);
    if (qty > 0 && qty <= 9999) return qty;
  }

  const nums = [...segment.matchAll(/\b(\d+(?:\.\d+)?)\b/g)]
    .map((m) => parseFloat(m[1]!))
    .filter((n) => Number.isFinite(n) && n > 0 && n <= 9999);
  return nums[0] ?? 1;
}

function parseUnitFromLine(line: string): string {
  const unitToken = line.match(
    /\b(CASE|CAS|CS|EACH|EA|LB|LBS|BAG|PK|BOX|GAL|OZ)\b/i
  );
  if (unitToken) {
    const raw = unitToken[1]!.toLowerCase();
    if (/case|cas|cs/.test(raw)) return "case";
    if (/lb|lbs/.test(raw)) return "lb";
    if (/bag/.test(raw)) return "bag";
    if (/ea|each/.test(raw)) return "each";
    return raw;
  }

  const pkg = line.match(PACKAGE_PATTERN);
  if (!pkg) return "each";
  const raw = pkg[0]!.toLowerCase();
  if (/case|cas|cs/.test(raw)) return "case";
  if (/lb|lbs/.test(raw)) return "lb";
  if (/bag/.test(raw)) return "bag";
  if (/ea|each/.test(raw)) return "each";
  return "each";
}

function applySkuHint(line: InvoiceLineData, hints?: SkuLineHint[]): InvoiceLineData {
  if (!line.sku || !hints?.length) return line;
  const hint = hints.find((h) => h.sku.toUpperCase() === line.sku!.toUpperCase());
  if (!hint) return line;
  return {
    ...line,
    description:
      !line.description || line.description.length < 3 || line.description === line.sku
        ? hint.description
        : line.description,
    unit: line.unit === "each" && hint.unit ? hint.unit : line.unit,
    unitPrice: line.unitPrice <= 0 && hint.unitPrice != null ? hint.unitPrice : line.unitPrice,
  };
}

function parseLineFromMoneyColumns(
  line: string,
  itemCode: RegExp,
  hints?: SkuLineHint[]
): InvoiceLineData | null {
  if (SKIP_LINE.test(line)) return null;
  if (line.length < 8) return null;

  const tabParts = line.split(/\t+/).map((p) => p.trim()).filter(Boolean);
  if (tabParts.length >= 3) {
    const moneyParts = tabParts.filter((p) => /^[\d,]+\.\d{2}$/.test(p));
    if (moneyParts.length >= 1) {
      const lineTotal = parseMoney(moneyParts[moneyParts.length - 1]!);
      const unitPrice = moneyParts.length >= 2 ? parseMoney(moneyParts[moneyParts.length - 2]!) : lineTotal;
      const descPart = tabParts.find((p) => /[A-Za-z]{3,}/.test(p) && !/^[\d,]+\.\d{2}$/.test(p)) ?? tabParts[0]!;
      const skuMatch = descPart.match(itemCode);
      const sku = skuMatch?.[1];
      let description = descPart.replace(itemCode, "").trim();
      if (description.length < 2) description = descPart;
      const qty = parseQtyFromLine(descPart, description, sku);
      const catchWeight = parseCatchWeight(line);
      const item: InvoiceLineData = {
        description,
        qty: qty || 1,
        unit: parseUnitFromLine(line),
        unitPrice: unitPrice || lineTotal,
        lineTotal,
        sku,
        ...(catchWeight.billed
          ? { catchWeightBilled: catchWeight.billed, catchWeightUnit: catchWeight.unit ?? "lbs" }
          : {}),
      };
      return applySkuHint(item, hints);
    }
  }

  const moneyMatches = [...line.matchAll(/([\d,]+\.\d{2})/g)];
  if (!moneyMatches.length) return null;

  const priceMatches =
    moneyMatches.length >= 2 ? moneyMatches.slice(-2) : moneyMatches.slice(-1);

  let lineTotal = parseMoney(priceMatches[priceMatches.length - 1]![1]!);
  let unitPrice =
    priceMatches.length >= 2 ? parseMoney(priceMatches[0]![1]!) : lineTotal;

  if (lineTotal <= 0 || lineTotal > 50_000) return null;
  if (unitPrice <= 0 || unitPrice > 50_000) unitPrice = lineTotal;
  if (unitPrice > lineTotal && lineTotal > 0) {
    [unitPrice, lineTotal] = [lineTotal, unitPrice];
  }

  const priceStart = priceMatches[0]!.index ?? line.length;
  const beforePrices = line.slice(0, priceStart).trim();
  const skuMatch = beforePrices.match(itemCode);
  const sku = skuMatch?.[1];
  const qty = parseQtyFromLine(beforePrices, "", sku);

  let description = beforePrices;
  if (sku) description = description.replace(itemCode, "").trim();
  description = description
    .replace(
      /(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(?:EACH|EA|CASE|CAS|CS|LB|LBS|BAG|PK|BOX|\d+(?:\s*\/\s*\d+)?\s*#(?:\/\w+)?)/gi,
      " "
    )
    .replace(PACKAGE_PATTERN, " ")
    .replace(/\b\d+\s*CT\b/gi, " ")
    .replace(/\s{2,}/g, " ")
    .trim();

  if (description.length < 2) return null;

  const unit = parseUnitFromLine(line);
  const catchWeight = parseCatchWeight(line);

  if (qty > 0 && unitPrice > 0 && lineTotal > 0) {
    const expected = unitPrice * qty;
    if (Math.abs(expected - lineTotal) > Math.max(0.5, lineTotal * 0.05)) {
      unitPrice = lineTotal / qty;
    }
  }

  const item: InvoiceLineData = {
    description,
    qty: qty || 1,
    unit,
    unitPrice,
    lineTotal,
    sku,
    ...(catchWeight.billed
      ? { catchWeightBilled: catchWeight.billed, catchWeightUnit: catchWeight.unit ?? "lbs" }
      : {}),
  };
  return applySkuHint(item, hints);
}

function parseLineItems(text: string, ctx?: InvoiceParseContext): InvoiceLineData[] {
  const itemCode = itemCodeRegex(ctx);
  const rows = expandOcrLines(text, itemCode);
  const items: InvoiceLineData[] = [];
  const seen = new Set<string>();

  for (const line of rows) {
    const item = parseLineFromMoneyColumns(line, itemCode, ctx?.skuHints);
    if (!item) continue;

    const key = `${item.sku ?? ""}|${item.description.slice(0, 40)}|${item.lineTotal}`;
    if (seen.has(key)) continue;
    seen.add(key);

    items.push(item);
  }

  return items.slice(0, 60);
}

function reconcileAmount(amount: number, lines: InvoiceLineData[]): number {
  if (!lines.length) return amount;
  const lineSum = lines.reduce((sum, l) => sum + l.lineTotal, 0);
  if (lineSum <= 0) return amount;
  if (amount <= 0) return lineSum;
  if (Math.abs(amount - lineSum) <= Math.max(2, lineSum * 0.03)) return amount;
  if (amount < lineSum * 0.5) return lineSum;
  return amount;
}

export function scoreInvoiceData(data: InvoiceData): number {
  let score = 0;
  const vendor = data.vendor?.trim() ?? "";
  if (vendor && !/^unknown/i.test(vendor)) score += 4;
  score += Math.min(data.lines.length, 30) * 3;
  if (data.invoiceNumber) score += 2;
  if (data.amount > 0) score += 1;
  if (data.lines.length > 0 && data.amount > 0) {
    const sum = data.lines.reduce((s, l) => s + l.lineTotal, 0);
    if (Math.abs(sum - data.amount) <= Math.max(2, data.amount * 0.03)) score += 4;
  }
  return score;
}

export function mergeInvoiceData(...sources: InvoiceData[]): InvoiceData {
  const usable = sources.filter(Boolean);
  if (!usable.length) {
    return {
      vendor: "",
      invoiceNumber: "",
      amount: 0,
      invoiceDate: new Date().toISOString().split("T")[0]!,
      lines: [],
    };
  }
  if (usable.length === 1) return usable[0]!;

  const ranked = [...usable].sort((a, b) => scoreInvoiceData(b) - scoreInvoiceData(a));
  const best = ranked[0]!;

  const vendor =
    usable
      .map((s) => s.vendor?.trim())
      .find((v) => v && !/^unknown/i.test(v)) ?? best.vendor;

  const invoiceNumber =
    usable.map((s) => s.invoiceNumber?.trim()).find(Boolean) ?? best.invoiceNumber;

  const lines = usable.reduce(
    (longest, s) => (s.lines.length > longest.length ? s.lines : longest),
    [] as InvoiceLineData[]
  );

  const amountCandidates = usable.map((s) => s.amount).filter((a) => a > 0);
  let amount = amountCandidates.length ? Math.max(...amountCandidates) : best.amount;
  if (lines.length > 0 && amountCandidates.length > 0) {
    const lineSum = lines.reduce((s, l) => s + l.lineTotal, 0);
    amount = amountCandidates.reduce((closest, candidate) =>
      Math.abs(candidate - lineSum) < Math.abs(closest - lineSum) ? candidate : closest
    );
    amount = reconcileAmount(amount, lines);
  } else if (lines.length > 0) {
    amount = lines.reduce((s, l) => s + l.lineTotal, 0);
  }

  const invoiceDate =
    usable.map((s) => s.invoiceDate).find((d) => d && d !== new Date().toISOString().split("T")[0]) ??
    best.invoiceDate;

  return { vendor, invoiceNumber, amount, invoiceDate, lines };
}

export function parseInvoiceFromText(rawText: string, ctx?: InvoiceParseContext): InvoiceData {
  const text = normalizeOcrText(rawText);
  const lines = parseLineItems(text, ctx);
  const amount = reconcileAmount(
    extractTotalAmount(text, { totalLabel: ctx?.totalLabel, lineItemCount: lines.length }),
    lines
  );

  return {
    vendor: extractVendorName(text),
    invoiceNumber: extractInvoiceNumber(text),
    amount,
    invoiceDate: extractDocumentDate(text),
    lines,
  };
}

export function hasUsefulInvoiceData(data: InvoiceData): boolean {
  const vendor = data.vendor?.trim() ?? "";
  const hasVendor = Boolean(vendor && !/^unknown/i.test(vendor));
  if (hasVendor && data.lines.length > 0) return true;
  if (hasVendor && data.amount > 0 && data.invoiceNumber) return true;
  if (data.lines.length >= 2) return true;
  return false;
}
