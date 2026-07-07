import type { InvoiceData, InvoiceLineData } from "@/lib/ai/analyze-invoice";
import type { SkuLineHint } from "./vendor-memory";
import {
  extractDocumentDate,
  extractInvoiceNumber,
  extractTotalAmount,
  extractVendorName,
  normalizeOcrText,
  parseMoney,
  stripEmbeddedDates,
} from "./parse-text-utils";

export interface InvoiceParseContext {
  itemCodePattern?: string;
  totalLabel?: string;
  skuHints?: SkuLineHint[];
}

const DEFAULT_ITEM_CODE = /^([A-Z]{2,6}\d{2,4})\b/;
const ALT_ITEM_CODE = /\b([A-Z]{2,5}[-\s]?\d{3,5})\b/;

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
  const joined = joinWrappedLineRows(lines, itemCode);
  if (joined.length > 3) return joined;

  const split = text.split(/\b(?=[A-Z]{2,6}\d{2,4}\b)/).map((l) => l.trim()).filter(Boolean);
  return split.length > joined.length ? joinWrappedLineRows(split, itemCode) : joined;
}

function joinWrappedLineRows(rows: string[], itemCode: RegExp): string[] {
  const joined: string[] = [];
  let buffer = "";

  for (const row of rows) {
    if (!buffer) {
      buffer = row;
      continue;
    }

    const bufferHasMoney = /[\d,]+\.\d{2}/.test(buffer);
    const rowHasMoney = /[\d,]+\.\d{2}/.test(row);
    const bufferHasSku = itemCode.test(buffer) || ALT_ITEM_CODE.test(buffer);

    const bufferSkuOnly = looksLikeSku(buffer.trim());
    const rowHasName = /[A-Za-z]{3,}/.test(row) && !looksLikeSku(row.trim());

    // SKU-only line followed by product name (no prices yet).
    if (bufferSkuOnly && !bufferHasMoney && !rowHasMoney && rowHasName) {
      buffer = `${buffer} ${row}`;
      continue;
    }

    // SKU + name line followed by qty/prices.
    if (bufferHasSku && !bufferHasMoney && rowHasMoney) {
      buffer = `${buffer} ${row}`;
      continue;
    }

    joined.push(buffer);
    buffer = row;
  }

  if (buffer) joined.push(buffer);
  return joined;
}

function parseCatchWeight(line: string, opts?: { unit?: string; qty?: number; unitPrice?: number; lineTotal?: number }): { billed?: number; unit?: string } {
  if (opts?.unit === "lb" && opts.qty && opts.unitPrice && opts.lineTotal) {
    const expected = opts.qty * opts.unitPrice;
    if (Math.abs(expected - opts.lineTotal) <= Math.max(0.5, opts.lineTotal * 0.05)) {
      return {};
    }
  }

  const match = line.match(/\b(\d+(?:\.\d+)?)\s*(LB|LBS|KG|KGS)\b/i);
  if (!match) return {};
  const billed = parseFloat(match[1]!);
  if (!Number.isFinite(billed) || billed <= 0 || billed > 9999) return {};
  return { billed, unit: match[2]!.toLowerCase().startsWith("kg") ? "kg" : "lbs" };
}

/** Distributor table tail: Qty Ordered · Qty Shipped · Package · Unit $ · Extended $ */

interface ParsedDistributorTail {
  qtyOrdered: number;
  qtyShipped: number;
  packageRaw: string;
  unitPrice: number;
  lineTotal: number;
  descEndIndex: number;
}

function parseDistributorTail(line: string): ParsedDistributorTail | null {
  const moneyMatches = [...line.matchAll(/([\d,]+\.\d{2})/g)];
  if (moneyMatches.length < 2) return null;

  const unitPriceMatch = moneyMatches[moneyMatches.length - 2]!;
  const lineTotalMatch = moneyMatches[moneyMatches.length - 1]!;
  const unitPrice = parseMoney(unitPriceMatch[1]!);
  const lineTotal = parseMoney(lineTotalMatch[1]!);
  if (unitPrice <= 0 || lineTotal <= 0 || unitPrice > 50_000 || lineTotal > 50_000) return null;

  if (moneyMatches.length >= 4) {
    const qtyOrdMatch = moneyMatches[moneyMatches.length - 4]!;
    const qtyShipMatch = moneyMatches[moneyMatches.length - 3]!;
    const qtyOrdered = parseFloat(qtyOrdMatch[1]!.replace(/,/g, ""));
    const qtyShipped = parseFloat(qtyShipMatch[1]!.replace(/,/g, ""));
    if (!Number.isFinite(qtyOrdered) || !Number.isFinite(qtyShipped)) return null;

    const packageRaw = line
      .slice(qtyShipMatch.index! + qtyShipMatch[0].length, unitPriceMatch.index!)
      .trim();

    return {
      qtyOrdered,
      qtyShipped,
      packageRaw,
      unitPrice,
      lineTotal,
      descEndIndex: qtyOrdMatch.index!,
    };
  }

  const beforeUnitPrice = line.slice(0, unitPriceMatch.index!).trimEnd();
  const tailPair = beforeUnitPrice.match(
    /(\d+\.\d{2})\s+(\d+\.\d{2})\s+(.+)\s*$/i
  );
  if (tailPair) {
    return {
      qtyOrdered: parseFloat(tailPair[1]!),
      qtyShipped: parseFloat(tailPair[2]!),
      packageRaw: tailPair[3]!.trim(),
      unitPrice,
      lineTotal,
      descEndIndex: tailPair.index!,
    };
  }

  const singleQty = beforeUnitPrice.match(/(\d+\.\d{2})\s+(.+)\s*$/i);
  if (singleQty) {
    const qty = parseFloat(singleQty[1]!);
    return {
      qtyOrdered: qty,
      qtyShipped: qty,
      packageRaw: singleQty[2]!.trim(),
      unitPrice,
      lineTotal,
      descEndIndex: singleQty.index!,
    };
  }

  return {
    qtyOrdered: 1,
    qtyShipped: 1,
    packageRaw: beforeUnitPrice.split(/\s+/).slice(-1)[0] ?? "each",
    unitPrice,
    lineTotal,
    descEndIndex: beforeUnitPrice.length,
  };
}

function parseUnitFromPackage(packageRaw: string, lineFallback?: string): string {
  const pkg = packageRaw.trim().toUpperCase();
  if (!pkg) return parseUnitFromLine(lineFallback ?? "");

  if (/^LB|^LBS$/.test(pkg)) return "lb";
  if (/^EACH|^EA$/.test(pkg)) return "each";
  if (/^CASE|^CAS|^CS$/.test(pkg)) return "case";
  if (/^BAG|^PK|^BOX$/.test(pkg)) return "bag";
  if (/#\/BAG|#\/BAGS|\d+\s*#\/\s*BAG/i.test(pkg)) return "bag";
  if (/#\/CAS|\/CAS|\d+\/\d+#/i.test(pkg)) return "case";
  if (/^GAL|^OZ$/.test(pkg)) return pkg.toLowerCase();

  if (lineFallback) return parseUnitFromLine(lineFallback);
  return "each";
}

function parseDistributorTableRow(
  line: string,
  itemCode: RegExp,
  hints?: SkuLineHint[]
): InvoiceLineData | null {
  const tail = parseDistributorTail(line);
  if (!tail) return null;

  const header = line.slice(0, tail.descEndIndex).trim();
  const { sku, description } = extractSkuAndDescription(header, itemCode, { stripTailColumns: false });
  if (!sku && !description.trim()) return null;

  const qty = tail.qtyShipped > 0 ? tail.qtyShipped : tail.qtyOrdered;
  let unitPrice = tail.unitPrice;
  let lineTotal = tail.lineTotal;
  const unit = parseUnitFromPackage(tail.packageRaw, line);

  if (qty > 0 && unitPrice > 0 && lineTotal > 0) {
    const expected = unitPrice * qty;
    if (Math.abs(expected - lineTotal) > Math.max(0.5, lineTotal * 0.05)) {
      unitPrice = lineTotal / qty;
    }
  }

  const catchWeight = parseCatchWeight(line, { unit, qty, unitPrice, lineTotal });

  return finalizeLineItem(
    {
      description,
      qty: qty || 1,
      unit,
      unitPrice,
      lineTotal,
      sku,
      ...(catchWeight.billed
        ? { catchWeightBilled: catchWeight.billed, catchWeightUnit: catchWeight.unit ?? "lbs" }
        : {}),
    },
    hints
  );
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

function looksLikeSku(value: string): boolean {
  const trimmed = value.trim();
  return DEFAULT_ITEM_CODE.test(trimmed) || ALT_ITEM_CODE.test(trimmed);
}

function isSkuOnlyDescription(description: string, sku?: string): boolean {
  const desc = description.trim();
  if (!desc) return true;
  if (sku && desc.toUpperCase() === sku.toUpperCase()) return true;
  return looksLikeSku(desc);
}

/** Pull SKU from the front of a line segment and return the product name. */
function extractSkuAndDescription(
  segment: string,
  itemCode: RegExp,
  opts?: { stripTailColumns?: boolean }
): { sku?: string; description: string } {
  let rest = segment.trim();
  let sku: string | undefined;

  const atStart = rest.match(/^([A-Z]{2,6}\d{2,4})\b/i);
  if (atStart?.[1]) {
    sku = atStart[1].toUpperCase();
    rest = rest.slice(atStart[0].length).trim();
  } else {
    const altStart = rest.match(/^([A-Z]{2,5}[-\s]?\d{3,5})\b/i);
    if (altStart?.[1]) {
      sku = altStart[1].replace(/\s+/g, "").toUpperCase();
      rest = rest.slice(altStart[0].length).trim();
    } else {
      const embedded = rest.match(itemCode) ?? rest.match(ALT_ITEM_CODE);
      if (embedded?.[1] && (embedded.index ?? 99) <= 2) {
        sku = embedded[1].replace(/\s+/g, "").toUpperCase();
        rest = rest.slice(0, embedded.index!) + rest.slice(embedded.index! + embedded[0].length);
        rest = rest.trim();
      }
    }
  }

  if (opts?.stripTailColumns !== false) {
    rest = rest
      .replace(
        /(\d+\.\d{2})\s+(\d+\.\d{2})\s+(?:EACH|EA|CASE|CAS|CS|LB|LBS|BAG|PK|BOX|\d+(?:\s*\/\s*\d+)?\s*#(?:\/\w+)?)/gi,
        " "
      )
      .replace(PACKAGE_PATTERN, " ")
      .replace(/\s{2,}/g, " ")
      .trim();
  }

  if (isSkuOnlyDescription(rest, sku)) {
    rest = "";
  }

  rest = stripEmbeddedDates(rest);

  return { sku, description: rest };
}

function applySkuHint(line: InvoiceLineData, hints?: SkuLineHint[]): InvoiceLineData {
  if (!line.sku || !hints?.length) return line;
  const hint = hints.find((h) => h.sku.toUpperCase() === line.sku!.toUpperCase());
  if (!hint) return line;
  const needsDescription =
    !line.description || line.description.length < 3 || isSkuOnlyDescription(line.description, line.sku);
  return {
    ...line,
    description: needsDescription ? hint.description : line.description,
    unit: line.unit === "each" && hint.unit ? hint.unit : line.unit,
    unitPrice: line.unitPrice <= 0 && hint.unitPrice != null ? hint.unitPrice : line.unitPrice,
  };
}

function finalizeLineItem(line: InvoiceLineData, hints?: SkuLineHint[]): InvoiceLineData | null {
  let next = { ...line };

  if (!next.sku && looksLikeSku(next.description)) {
    next.sku = next.description.trim().toUpperCase();
    next.description = "";
  }

  if (next.sku && isSkuOnlyDescription(next.description, next.sku)) {
    next.description = "";
  }

  next = applySkuHint(next, hints);

  if (!next.sku && !next.description.trim()) return null;
  if (!next.lineTotal && !next.unitPrice) return null;

  return next;
}

function parseTabColumns(
  tabParts: string[],
  itemCode: RegExp,
  line: string,
  hints?: SkuLineHint[]
): InvoiceLineData | null {
  const joined = tabParts.join("\t");
  const distributorRow = parseDistributorTableRow(joined.replace(/\t+/g, " "), itemCode, hints);
  if (distributorRow) return distributorRow;

  const moneyParts = tabParts.filter((p) => /^[\d,]+\.\d{2}$/.test(p));
  if (!moneyParts.length) return null;

  const lineTotal = parseMoney(moneyParts[moneyParts.length - 1]!);
  const unitPrice = moneyParts.length >= 2 ? parseMoney(moneyParts[moneyParts.length - 2]!) : lineTotal;

  let sku: string | undefined;
  let description = "";

  const skuIdx = tabParts.findIndex((p) => itemCode.test(p) || ALT_ITEM_CODE.test(p));
  if (skuIdx >= 0) {
    const skuCell = tabParts[skuIdx]!;
    const extracted = extractSkuAndDescription(skuCell, itemCode);
    sku = extracted.sku;
    description = extracted.description;

    const firstMoneyIdx = tabParts.findIndex((p) => /^[\d,]+\.\d{2}$/.test(p));
    for (let i = skuIdx + 1; i < (firstMoneyIdx >= 0 ? firstMoneyIdx : tabParts.length); i += 1) {
      const part = tabParts[i]!;
      if (/[A-Za-z]{2,}/.test(part) && !looksLikeSku(part) && !/^[\d,]+\.\d{2}$/.test(part)) {
        description = description ? `${description} ${part}` : part;
        break;
      }
    }
  } else {
    const textPart = tabParts.find(
      (p) => /[A-Za-z]{2,}/.test(p) && !/^[\d,]+\.\d{2}$/.test(p)
    );
    if (textPart) {
      const extracted = extractSkuAndDescription(textPart, itemCode);
      sku = extracted.sku;
      description = extracted.description;
    }
  }

  const qtySource = tabParts.filter((p) => !/^[\d,]+\.\d{2}$/.test(p)).join(" ");
  const qty = parseQtyFromLine(qtySource, description, sku);
  const catchWeight = parseCatchWeight(line, {
    unit: parseUnitFromLine(line),
    qty,
    unitPrice: unitPrice || lineTotal,
    lineTotal,
  });

  return finalizeLineItem(
    {
      description,
      qty: qty || 1,
      unit: parseUnitFromLine(line),
      unitPrice: unitPrice || lineTotal,
      lineTotal,
      sku,
      ...(catchWeight.billed
        ? { catchWeightBilled: catchWeight.billed, catchWeightUnit: catchWeight.unit ?? "lbs" }
        : {}),
    },
    hints
  );
}

function parseLineFromMoneyColumns(
  line: string,
  itemCode: RegExp,
  hints?: SkuLineHint[]
): InvoiceLineData | null {
  if (SKIP_LINE.test(line)) return null;
  if (line.length < 8) return null;

  const distributorRow = parseDistributorTableRow(line, itemCode, hints);
  if (distributorRow) return distributorRow;

  const tabParts = line.split(/\t+/).map((p) => p.trim()).filter(Boolean);
  if (tabParts.length >= 3) {
    const tabItem = parseTabColumns(tabParts, itemCode, line, hints);
    if (tabItem) return tabItem;
  }

  const moneyMatches = [...line.matchAll(/([\d,]+\.\d{2})/g)];
  if (!moneyMatches.length) return null;

  // Skip qty columns (e.g. 6.00 6.00) — use last two money values as unit + extended.
  const priceMatches = moneyMatches.length >= 2 ? moneyMatches.slice(-2) : moneyMatches.slice(-1);

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
  const { sku, description } = extractSkuAndDescription(beforePrices, itemCode);
  const qty = parseQtyFromLine(beforePrices, description, sku);

  if (!description && !sku) return null;

  const unit = parseUnitFromLine(line);
  const catchWeight = parseCatchWeight(line, { unit, qty, unitPrice, lineTotal });

  if (qty > 0 && unitPrice > 0 && lineTotal > 0) {
    const expected = unitPrice * qty;
    if (Math.abs(expected - lineTotal) > Math.max(0.5, lineTotal * 0.05)) {
      unitPrice = lineTotal / qty;
    }
  }

  return finalizeLineItem(
    {
      description,
      qty: qty || 1,
      unit,
      unitPrice,
      lineTotal,
      sku,
      ...(catchWeight.billed
        ? { catchWeightBilled: catchWeight.billed, catchWeightUnit: catchWeight.unit ?? "lbs" }
        : {}),
    },
    hints
  );
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
  if (usable.length === 1) {
    const single = usable[0]!;
    return {
      ...single,
      lines: single.lines.map((line, i) => normalizeInvoiceLine(line, i)),
    };
  }

  const ranked = [...usable].sort((a, b) => scoreInvoiceData(b) - scoreInvoiceData(a));
  const best = ranked[0]!;

  const vendor =
    usable
      .map((s) => s.vendor?.trim())
      .find((v) => v && !/^unknown/i.test(v)) ?? best.vendor;

  const invoiceNumber =
    usable.map((s) => s.invoiceNumber?.trim()).find(Boolean) ?? best.invoiceNumber;

  const lines = best.lines.length > 0
    ? best.lines
    : usable.reduce(
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

  const normalizedLines = lines.map((line, i) => normalizeInvoiceLine(line, i));

  return { vendor, invoiceNumber, amount, invoiceDate, lines: normalizedLines };
}

export function parseInvoiceFromText(rawText: string, ctx?: InvoiceParseContext): InvoiceData {
  const text = normalizeOcrText(rawText);
  const vendor = extractVendorName(text);
  const lines = parseLineItems(text, ctx);
  const amount = reconcileAmount(
    extractTotalAmount(text, { totalLabel: ctx?.totalLabel ?? "Total Invoice", lineItemCount: lines.length }),
    lines
  );

  return {
    vendor,
    invoiceNumber: extractInvoiceNumber(text),
    amount,
    invoiceDate: extractDocumentDate(text, { vendor }),
    lines: lines.map((line, i) => normalizeInvoiceLine(line, i)),
  };
}

/** Normalize a line so SKU never occupies the description field. */
export function normalizeInvoiceLine(
  line: Partial<InvoiceLineData>,
  index: number
): InvoiceLineData {
  let description = stripEmbeddedDates(String(line.description ?? "").trim());
  let sku = line.sku ? String(line.sku).trim().toUpperCase() : undefined;

  if (!sku && looksLikeSku(description)) {
    sku = description.toUpperCase();
    description = "";
  }
  if (sku && description.toUpperCase() === sku) {
    description = "";
  }

  return {
    description: description || (sku ? "" : `Line item ${index + 1}`),
    qty: Number(line.qty) || 0,
    unit: String(line.unit ?? "each"),
    unitPrice: Number(line.unitPrice) || 0,
    lineTotal: Number(line.lineTotal) || 0,
    sku,
    inventoryItemId: line.inventoryItemId,
    catchWeightBilled: line.catchWeightBilled,
    catchWeightUnit: line.catchWeightUnit,
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
