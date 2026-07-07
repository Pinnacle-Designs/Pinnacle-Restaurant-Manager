import { prisma } from "@/lib/prisma";
import type { InvoiceData, InvoiceLineData } from "@/lib/ai/analyze-invoice";
import type { ReceiptData } from "@/lib/ai";
import { vendorNamesMatch } from "@/lib/purchasing/invoice-linking";

type OcrAliasRow = {
  field: string;
  ocrValue: string;
  correctedValue: string;
  hitCount: number;
};

type OcrProfileRow = {
  id: string;
  vendorKey: string;
  displayName: string;
  scanCount: number;
  layoutHints: string | null;
  aliases: OcrAliasRow[];
};

export interface SkuLineHint {
  sku: string;
  description: string;
  unit: string;
  unitPrice?: number;
}

export interface VendorOcrContext {
  profileId?: string;
  displayName?: string;
  vendorKey?: string;
  scanCount: number;
  aliases: Array<{ field: string; ocrValue: string; correctedValue: string; hitCount: number }>;
  skuHints: SkuLineHint[];
  topVendors: Array<{ displayName: string; scanCount: number }>;
  layoutHints: { totalLabel?: string; itemCodePattern?: string };
  promptBlock: string;
}

export function normalizeVendorKey(vendor: string): string {
  return vendor
    .toLowerCase()
    .replace(/\b(ltd|limited|inc|corp|co|llc|led|manufacturers?)\b\.?/gi, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizeAliasKey(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function parseSkuHint(value: string): SkuLineHint | null {
  try {
    const parsed = JSON.parse(value) as SkuLineHint;
    if (parsed?.sku && parsed?.description) return parsed;
  } catch {
    /* ignore */
  }
  return null;
}

async function upsertAlias(
  profileId: string,
  field: string,
  ocrValue: string,
  correctedValue: string
) {
  const ocrKey = normalizeAliasKey(ocrValue);
  const corrected = correctedValue.trim();
  if (!ocrKey || !corrected || ocrKey === normalizeAliasKey(corrected)) return;

  await prisma.vendorOcrAlias.upsert({
    where: {
      profileId_field_ocrValue: { profileId, field, ocrValue: ocrKey },
    },
    create: { profileId, field, ocrValue: ocrKey, correctedValue: corrected },
    update: {
      correctedValue: corrected,
      hitCount: { increment: 1 },
      lastUsedAt: new Date(),
    },
  });
}

async function ensureProfile(locationId: string, vendor: string) {
  const displayName = vendor.trim();
  const vendorKey = normalizeVendorKey(displayName);
  return prisma.vendorOcrProfile.upsert({
    where: { locationId_vendorKey: { locationId, vendorKey } },
    create: { locationId, vendorKey, displayName },
    update: { displayName },
  });
}

async function findBestProfile(locationId: string, vendorHint?: string) {
  const profiles = (await prisma.vendorOcrProfile.findMany({
    where: { locationId },
    include: {
      aliases: { orderBy: { hitCount: "desc" }, take: 80 },
    },
    orderBy: { scanCount: "desc" },
    take: 20,
  })) as OcrProfileRow[];

  if (!vendorHint?.trim()) return { profile: null, profiles };

  const matched =
    profiles.find((p) => vendorNamesMatch(vendorHint, p.displayName)) ??
    profiles.find((p) => normalizeVendorKey(vendorHint) === p.vendorKey);

  if (matched) return { profile: matched, profiles };

  const vendorAlias = profiles
    .flatMap((p) => p.aliases.filter((a) => a.field === "vendor").map((a) => ({ profile: p, alias: a })))
    .find(({ alias }) => normalizeAliasKey(vendorHint) === alias.ocrValue || vendorHint.toLowerCase().includes(alias.ocrValue));

  if (vendorAlias) return { profile: vendorAlias.profile, profiles };

  return { profile: null, profiles };
}

export async function buildVendorOcrContext(
  locationId: string,
  vendorHint?: string
): Promise<VendorOcrContext> {
  const { profile, profiles } = await findBestProfile(locationId, vendorHint);

  const aliases = profile?.aliases ?? [];
  const skuHints = aliases
    .filter((a) => a.field === "sku_line")
    .map((a) => parseSkuHint(a.correctedValue))
    .filter((h): h is SkuLineHint => Boolean(h))
    .slice(0, 40);

  const topVendors = profiles.slice(0, 8).map((p) => ({
    displayName: p.displayName,
    scanCount: p.scanCount,
  }));

  let layoutHints: VendorOcrContext["layoutHints"] = {};
  if (profile?.layoutHints) {
    try {
      layoutHints = JSON.parse(profile.layoutHints) as VendorOcrContext["layoutHints"];
    } catch {
      /* ignore */
    }
  }

  const lines: string[] = [];
  if (profile) {
    lines.push(
      `Verified vendor "${profile.displayName}" (${profile.scanCount} past scan${profile.scanCount === 1 ? "" : "s"} at this location):`
    );
    for (const alias of aliases.filter((a) => a.field === "vendor").slice(0, 5)) {
      lines.push(`- OCR vendor "${alias.ocrValue}" → use "${alias.correctedValue}"`);
    }
    for (const hint of skuHints.slice(0, 25)) {
      lines.push(
        `- SKU ${hint.sku}: "${hint.description}" (${hint.unit}${hint.unitPrice != null ? `, ~$${hint.unitPrice.toFixed(2)}` : ""})`
      );
    }
    for (const alias of aliases.filter((a) => a.field === "category").slice(0, 3)) {
      lines.push(`- Expense category for this vendor: ${alias.correctedValue}`);
    }
    for (const alias of aliases.filter((a) => a.field === "receipt_description").slice(0, 3)) {
      lines.push(`- Receipt description format: "${alias.correctedValue}"`);
    }
    if (profile.layoutHints) {
      try {
        const hints = JSON.parse(profile.layoutHints) as Record<string, string>;
        if (hints.totalLabel) lines.push(`- Invoice total label: "${hints.totalLabel}"`);
        if (hints.itemCodePattern) lines.push(`- Item codes match pattern: ${hints.itemCodePattern}`);
      } catch {
        /* ignore */
      }
    }
  } else if (topVendors.length > 0) {
    lines.push(
      `Known vendors at this location: ${topVendors.map((v) => `${v.displayName} (${v.scanCount} scans)`).join(", ")}`
    );
  }

  const promptBlock =
    lines.length > 0
      ? `\n\nLearned from past verified scans at this restaurant (apply these corrections):\n${lines.join("\n")}`
      : "";

  return {
    profileId: profile?.id,
    displayName: profile?.displayName,
    vendorKey: profile?.vendorKey,
    scanCount: profile?.scanCount ?? 0,
    aliases: aliases.map((a) => ({
      field: a.field,
      ocrValue: a.ocrValue,
      correctedValue: a.correctedValue,
      hitCount: a.hitCount,
    })),
    skuHints,
    topVendors,
    layoutHints,
    promptBlock,
  };
}

function applyVendorAlias(vendor: string, aliases: VendorOcrContext["aliases"]): string {
  const key = normalizeAliasKey(vendor);
  const exact = aliases.find((a) => a.field === "vendor" && a.ocrValue === key);
  if (exact) return exact.correctedValue;

  const fuzzy = aliases
    .filter((a) => a.field === "vendor")
    .find((a) => key.includes(a.ocrValue) || a.ocrValue.includes(key));
  if (fuzzy) return fuzzy.correctedValue;

  return vendor;
}

function applyLineMemory(line: InvoiceLineData, ctx: VendorOcrContext): InvoiceLineData {
  const next = { ...line };

  if (line.sku) {
    const skuKey = line.sku.toUpperCase();
    const hint = ctx.skuHints.find((h) => h.sku.toUpperCase() === skuKey);
    if (hint) {
      if (!next.description || next.description.length < 4 || next.description === line.sku) {
        next.description = hint.description;
      }
      if (hint.unit && (!next.unit || next.unit === "each")) next.unit = hint.unit;
      if (hint.unitPrice != null && next.unitPrice <= 0) next.unitPrice = hint.unitPrice;
    }

    const descAlias = ctx.aliases.find(
      (a) => a.field === "description" && a.ocrValue === normalizeAliasKey(`${skuKey}|${line.description}`)
    );
    if (descAlias) next.description = descAlias.correctedValue;

    const unitAlias = ctx.aliases.find(
      (a) => a.field === "unit" && a.ocrValue === normalizeAliasKey(skuKey)
    );
    if (unitAlias) next.unit = unitAlias.correctedValue;
  } else {
    const descAlias = ctx.aliases.find(
      (a) => a.field === "description" && a.ocrValue === normalizeAliasKey(line.description)
    );
    if (descAlias) next.description = descAlias.correctedValue;
  }

  if (next.qty > 0 && next.unitPrice > 0) {
    next.lineTotal = next.qty * next.unitPrice;
  }

  return next;
}

export function applyVendorMemoryToInvoice(invoice: InvoiceData, ctx: VendorOcrContext): InvoiceData {
  if (!ctx.profileId && ctx.aliases.length === 0 && ctx.skuHints.length === 0) {
    return invoice;
  }

  let vendor = invoice.vendor?.trim() ?? "";
  if (ctx.displayName && (!vendor || vendor.length < 3 || /^unknown/i.test(vendor))) {
    vendor = ctx.displayName;
  } else if (vendor) {
    vendor = applyVendorAlias(vendor, ctx.aliases);
    if (ctx.displayName && vendorNamesMatch(vendor, ctx.displayName)) {
      vendor = ctx.displayName;
    }
  } else if (ctx.displayName) {
    vendor = ctx.displayName;
  }

  const lines = invoice.lines.map((line) => applyLineMemory(line, ctx));

  const amount =
    invoice.amount > 0
      ? invoice.amount
      : lines.reduce((sum, l) => sum + (l.lineTotal || 0), 0);

  return { ...invoice, vendor, lines, amount };
}

function countInvoiceCorrections(original: InvoiceData, corrected: InvoiceData): number {
  let count = 0;
  if (normalizeAliasKey(original.vendor) !== normalizeAliasKey(corrected.vendor)) count += 1;
  if (original.invoiceNumber !== corrected.invoiceNumber) count += 1;
  if (Math.abs(original.amount - corrected.amount) > 0.02) count += 1;

  const maxLines = Math.max(original.lines.length, corrected.lines.length);
  for (let i = 0; i < maxLines; i += 1) {
    const a = original.lines[i];
    const b = corrected.lines[i];
    if (!a || !b) {
      count += 1;
      continue;
    }
    if (normalizeAliasKey(a.description) !== normalizeAliasKey(b.description)) count += 1;
    if ((a.sku ?? "") !== (b.sku ?? "")) count += 1;
    if (Math.abs(a.qty - b.qty) > 0.01) count += 1;
    if (a.unit !== b.unit) count += 1;
    if (Math.abs(a.unitPrice - b.unitPrice) > 0.02) count += 1;
  }
  return count;
}

export async function recordInvoiceScanLearning(
  locationId: string,
  params: {
    original: InvoiceData;
    corrected: InvoiceData;
    ocrSource?: string | null;
    invoiceId?: string;
  }
) {
  const correctedVendor = params.corrected.vendor.trim();
  if (!correctedVendor) return { correctionCount: 0 };

  const profile = await ensureProfile(locationId, correctedVendor);
  const correctionCount = countInvoiceCorrections(params.original, params.corrected);

  if (normalizeAliasKey(params.original.vendor) !== normalizeAliasKey(correctedVendor)) {
    await upsertAlias(profile.id, "vendor", params.original.vendor || correctedVendor, correctedVendor);
  }

  if (
    params.original.invoiceNumber &&
    params.original.invoiceNumber !== params.corrected.invoiceNumber
  ) {
    await upsertAlias(
      profile.id,
      "invoice_number",
      params.original.invoiceNumber,
      params.corrected.invoiceNumber
    );
  }

  const lineCount = Math.max(params.original.lines.length, params.corrected.lines.length);
  for (let i = 0; i < lineCount; i += 1) {
    const orig = params.original.lines[i];
    const fixed = params.corrected.lines[i];
    if (!orig || !fixed) continue;

    const sku = (fixed.sku ?? orig.sku ?? "").toUpperCase();
    if (sku && orig.description !== fixed.description) {
      await upsertAlias(
        profile.id,
        "description",
        `${sku}|${orig.description}`,
        fixed.description
      );
    } else if (orig.description !== fixed.description) {
      await upsertAlias(profile.id, "description", orig.description, fixed.description);
    }

    if (sku && orig.unit !== fixed.unit) {
      await upsertAlias(profile.id, "unit", sku, fixed.unit);
    }

    if (sku) {
      const hint: SkuLineHint = {
        sku,
        description: fixed.description,
        unit: fixed.unit,
        unitPrice: fixed.unitPrice > 0 ? fixed.unitPrice : undefined,
      };
      await upsertAlias(profile.id, "sku_line", sku, JSON.stringify(hint));
    }
  }

  if (params.original.amount > 0 && Math.abs(params.original.amount - params.corrected.amount) > 0.02) {
    await upsertAlias(
      profile.id,
      "total",
      String(Math.round(params.original.amount * 100) / 100),
      String(Math.round(params.corrected.amount * 100) / 100)
    );
  }

  const layoutHints = {
    totalLabel: "Total Invoice",
    itemCodePattern: profile.layoutHints
      ? (JSON.parse(profile.layoutHints) as { itemCodePattern?: string }).itemCodePattern
      : "[A-Z]{2,6}\\d{2,4}",
  };
  if (params.corrected.lines.some((l) => l.sku && /^[A-Z]{2,6}\d{2,4}$/.test(l.sku))) {
    layoutHints.itemCodePattern = "[A-Z]{2,6}\\d{2,4}";
  }

  await prisma.vendorOcrProfile.update({
    where: { id: profile.id },
    data: {
      scanCount: { increment: 1 },
      successCount: { increment: correctionCount === 0 ? 1 : 0 },
      layoutHints: JSON.stringify(layoutHints),
    },
  });

  await prisma.scanLearningEvent.create({
    data: {
      locationId,
      entityType: "invoice",
      entityId: params.invoiceId ?? null,
      vendorKey: profile.vendorKey,
      ocrSource: params.ocrSource ?? null,
      correctionCount,
      originalJson: JSON.stringify(params.original),
      correctedJson: JSON.stringify(params.corrected),
    },
  });

  return { correctionCount, profileId: profile.id };
}

export async function guessVendorFromMemory(
  locationId: string,
  ocrVendor: string
): Promise<string | null> {
  if (!ocrVendor.trim()) return null;
  const ctx = await buildVendorOcrContext(locationId, ocrVendor);
  if (ctx.displayName && vendorNamesMatch(ocrVendor, ctx.displayName)) return ctx.displayName;
  const alias = ctx.aliases.find((a) => a.field === "vendor" && a.ocrValue === normalizeAliasKey(ocrVendor));
  return alias?.correctedValue ?? null;
}

export function applyVendorMemoryToReceipt(receipt: ReceiptData, ctx: VendorOcrContext): ReceiptData {
  if (!ctx.profileId && ctx.aliases.length === 0) return receipt;

  let vendor = receipt.vendor?.trim() ?? "";
  if (ctx.displayName && (!vendor || vendor.length < 3 || /^unknown/i.test(vendor))) {
    vendor = ctx.displayName;
  } else if (vendor) {
    vendor = applyVendorAlias(vendor, ctx.aliases);
    if (ctx.displayName && vendorNamesMatch(vendor, ctx.displayName)) {
      vendor = ctx.displayName;
    }
  } else if (ctx.displayName) {
    vendor = ctx.displayName;
  }

  let category = receipt.category;
  const vendorKey = normalizeVendorKey(vendor);
  const categoryAlias = ctx.aliases.find(
    (a) => a.field === "category" && (a.ocrValue === vendorKey || a.ocrValue === normalizeAliasKey(vendor))
  );
  if (categoryAlias) category = categoryAlias.correctedValue;

  let description = receipt.description;
  const descAlias = ctx.aliases.find(
    (a) =>
      a.field === "receipt_description" &&
      (a.ocrValue === normalizeAliasKey(receipt.description) || a.ocrValue === vendorKey)
  );
  if (descAlias && (description.length < 4 || /^receipt/i.test(description))) {
    description = descAlias.correctedValue;
  } else if (vendor && /^receipt/i.test(description)) {
    description = descAlias?.correctedValue ?? `${vendor} receipt`;
  }

  return { ...receipt, vendor, category, description };
}

function countReceiptCorrections(original: ReceiptData, corrected: ReceiptData): number {
  let count = 0;
  if (normalizeAliasKey(original.vendor) !== normalizeAliasKey(corrected.vendor)) count += 1;
  if (normalizeAliasKey(original.description) !== normalizeAliasKey(corrected.description)) count += 1;
  if (original.category !== corrected.category) count += 1;
  if (Math.abs(original.amount - corrected.amount) > 0.02) count += 1;
  if (original.date !== corrected.date) count += 1;
  return count;
}

export async function recordReceiptScanLearning(
  locationId: string,
  params: {
    original: ReceiptData;
    corrected: ReceiptData;
    ocrSource?: string | null;
    expenseId?: string;
  }
) {
  const correctedVendor = params.corrected.vendor.trim();
  if (!correctedVendor) return { correctionCount: 0 };

  const profile = await ensureProfile(locationId, correctedVendor);
  const correctionCount = countReceiptCorrections(params.original, params.corrected);

  if (normalizeAliasKey(params.original.vendor) !== normalizeAliasKey(correctedVendor)) {
    await upsertAlias(
      profile.id,
      "vendor",
      params.original.vendor || correctedVendor,
      correctedVendor
    );
  }

  if (params.original.category !== params.corrected.category) {
    await upsertAlias(
      profile.id,
      "category",
      normalizeVendorKey(correctedVendor),
      params.corrected.category
    );
  }

  if (normalizeAliasKey(params.original.description) !== normalizeAliasKey(params.corrected.description)) {
    await upsertAlias(
      profile.id,
      "receipt_description",
      normalizeAliasKey(params.original.description) || normalizeVendorKey(correctedVendor),
      params.corrected.description
    );
  }

  await prisma.vendorOcrProfile.update({
    where: { id: profile.id },
    data: {
      scanCount: { increment: 1 },
      successCount: { increment: correctionCount === 0 ? 1 : 0 },
    },
  });

  await prisma.scanLearningEvent.create({
    data: {
      locationId,
      entityType: "receipt",
      entityId: params.expenseId ?? null,
      vendorKey: profile.vendorKey,
      ocrSource: params.ocrSource ?? null,
      correctionCount,
      originalJson: JSON.stringify(params.original),
      correctedJson: JSON.stringify(params.corrected),
    },
  });

  return { correctionCount, profileId: profile.id };
}
