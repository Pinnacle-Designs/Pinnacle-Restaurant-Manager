import { prisma } from "@/lib/prisma";
import { resolveInvoiceScan, resolveReceiptScan } from "@/lib/ocr/resolve-scan";
import { processDigitizedInvoice } from "@/lib/purchasing/invoice-digitization";
import { suggestPoLinkForInvoice } from "@/lib/purchasing/invoice-linking";
import {
  base64Input,
  filesToBase64,
  type ParsedScanForm,
  visionScanFromParsed,
} from "@/lib/scan/parse-scan-form";
import { buildPhotoAnalysis, type PhotoDigitizePayload } from "./photo-analysis";

export interface AutoDigitizeInput {
  locationId: string;
  category: string;
  imageUrl: string;
  parsed: ParsedScanForm;
  ocrText?: string | null;
  title?: string | null;
}

export interface AutoDigitizeResult {
  aiAnalysis: string;
  photoTitle?: string | null;
  tags: string[];
  digitized?: PhotoDigitizePayload;
}

export async function autoDigitizePhotoUpload(
  input: AutoDigitizeInput
): Promise<AutoDigitizeResult> {
  const { locationId, category, imageUrl, parsed } = input;
  const base64Images = await filesToBase64(parsed.files);
  const vision = visionScanFromParsed(parsed);
  const ocrText = input.ocrText ?? null;

  if (category === "RECEIPT") {
    const { receipt, source, memoryApplied } = await resolveReceiptScan(
      base64Input(base64Images),
      { ...vision, locationId },
      ocrText
    );

    const expense = await prisma.expense.create({
      data: {
        locationId,
        description: receipt.description || input.title || "Receipt expense",
        amount: receipt.amount || 0,
        category: receipt.category || "Other",
        date: receipt.date ? new Date(receipt.date) : new Date(),
        receiptUrl: imageUrl,
      },
    });

    await prisma.activityLog.create({
      data: {
        locationId,
        action: "RECEIPT_OCR",
        entity: "expense",
        entityId: expense.id,
        details: `Receipt from Photos: ${expense.description} $${expense.amount.toFixed(2)}`,
      },
    });

    const digitized: PhotoDigitizePayload = {
      version: 1,
      kind: "receipt",
      summary: `${receipt.description || "Receipt"} — ${receipt.amount ? `$${receipt.amount.toFixed(2)}` : "amount pending"}`,
      ocrSource: source,
      memoryApplied,
      expenseId: expense.id,
      data: receipt as unknown as Record<string, unknown>,
    };

    return {
      aiAnalysis: buildPhotoAnalysis(digitized),
      photoTitle: input.title || receipt.description || receipt.vendor || "Receipt",
      tags: ["receipt", "expense", receipt.category?.toLowerCase() ?? "other"].filter(Boolean),
      digitized,
    };
  }

  if (category === "VENDOR_INVOICE") {
    const { invoice, source, memoryApplied } = await resolveInvoiceScan(
      base64Input(base64Images),
      { ...vision, locationId },
      ocrText
    );

    const lines = (invoice.lines ?? []).map((line) => ({
      description: line.description,
      qty: line.qty,
      unit: line.unit,
      unitPrice: line.unitPrice,
      lineTotal: line.lineTotal,
      sku: line.sku ?? null,
      inventoryItemId: null,
      catchWeightBilled: line.catchWeightBilled ?? null,
      catchWeightUnit: line.catchWeightUnit ?? null,
    }));

    const lineSum = lines.reduce((sum, line) => sum + (Number(line.lineTotal) || 0), 0);
    const amount =
      lineSum > 0 && (!invoice.amount || Math.abs(invoice.amount - lineSum) > lineSum * 0.5)
        ? lineSum
        : invoice.amount || lineSum;

    let poId: string | null = null;
    let receiptId: string | null = null;
    if (invoice.vendor.trim()) {
      const suggested = await suggestPoLinkForInvoice(locationId, invoice.vendor);
      if (suggested) {
        poId = suggested.poId;
        receiptId = suggested.receiptId;
      }
    }

    const existing =
      invoice.invoiceNumber?.trim()
        ? await prisma.vendorInvoice.findFirst({
            where: {
              locationId,
              invoiceNumber: invoice.invoiceNumber.trim(),
              vendor: invoice.vendor || undefined,
            },
          })
        : null;

    let saved;
    if (existing) {
      await prisma.vendorInvoiceLine.deleteMany({ where: { invoiceId: existing.id } });
      saved = await prisma.vendorInvoice.update({
        where: { id: existing.id },
        data: {
          vendor: invoice.vendor || existing.vendor,
          amount: amount || existing.amount,
          invoiceDate: invoice.invoiceDate ? new Date(invoice.invoiceDate) : existing.invoiceDate,
          invoiceNumber: invoice.invoiceNumber?.trim() || existing.invoiceNumber,
          imageUrl: imageUrl || existing.imageUrl,
          ocrSource: source ?? existing.ocrSource,
          poId: poId ?? existing.poId,
          receiptId: receiptId ?? existing.receiptId,
          lines: { create: lines },
        },
        include: { lines: true },
      });
    } else {
      saved = await prisma.vendorInvoice.create({
        data: {
          locationId,
          vendor: invoice.vendor || "Unknown vendor",
          amount: amount || 0,
          category: "Food & Supplies",
          invoiceDate: invoice.invoiceDate ? new Date(invoice.invoiceDate) : new Date(),
          invoiceNumber: invoice.invoiceNumber || null,
          imageUrl,
          ocrSource: source,
          poId,
          receiptId,
          lines: { create: lines },
        },
        include: { lines: true },
      });
    }

    await processDigitizedInvoice(locationId, {
      id: saved.id,
      vendor: saved.vendor,
      amount: saved.amount,
      invoiceNumber: saved.invoiceNumber,
      invoiceDate: saved.invoiceDate,
      imageUrl: saved.imageUrl,
      poId: saved.poId,
      receiptId: saved.receiptId,
      lines: saved.lines.map((line) => ({
        description: line.description,
        qty: line.qty,
        unit: line.unit,
        unitPrice: line.unitPrice,
        lineTotal: line.lineTotal,
        sku: line.sku,
        inventoryItemId: line.inventoryItemId,
        catchWeightBilled: line.catchWeightBilled,
        catchWeightUnit: line.catchWeightUnit,
      })),
    });

    const digitized: PhotoDigitizePayload = {
      version: 1,
      kind: "vendor_invoice",
      summary: `${invoice.vendor || "Vendor"}${invoice.invoiceNumber ? ` #${invoice.invoiceNumber}` : ""} — $${(amount || 0).toFixed(2)}`,
      ocrSource: source,
      memoryApplied,
      invoiceId: saved.id,
      data: invoice as unknown as Record<string, unknown>,
    };

    return {
      aiAnalysis: buildPhotoAnalysis(digitized),
      photoTitle:
        input.title ||
        (invoice.invoiceNumber
          ? `${invoice.vendor || "Invoice"} #${invoice.invoiceNumber}`
          : invoice.vendor || "Vendor invoice"),
      tags: ["invoice", "vendor", invoice.vendor?.toLowerCase() ?? "unknown"].filter(Boolean),
      digitized,
    };
  }

  throw new Error(`Unsupported digitize category: ${category}`);
}
