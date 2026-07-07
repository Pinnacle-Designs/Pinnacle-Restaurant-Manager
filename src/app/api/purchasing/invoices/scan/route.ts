import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getLocationIdFromRequest } from "@/lib/location";
import { requirePermission } from "@/lib/api-auth";
import { processDigitizedInvoice } from "@/lib/purchasing/invoice-digitization";
import { suggestPoLinkForInvoice } from "@/lib/purchasing/invoice-linking";
import { recordInvoiceScanLearning } from "@/lib/ocr/vendor-memory";
import type { InvoiceData } from "@/lib/ai/analyze-invoice";
import { persistUploadFile, uploadErrorMessage } from "@/lib/persist-upload";
import { resolveInvoiceScan } from "@/lib/ocr/resolve-scan";
import { buildScanOcrMeta } from "@/lib/ocr/scan-response";
import {
  base64Input,
  filesToBase64,
  parseScanFormData,
  readOcrTextFromForm,
  scanUploadTooLarge,
  visionScanFromParsed,
} from "@/lib/scan/parse-scan-form";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const { error } = await requirePermission(request, "manage_inventory");
  if (error) return error;

  try {
    const locationId = await getLocationIdFromRequest(request);
    const formData = await request.formData();
    const parsed = parseScanFormData(formData);

    if (parsed.files.length === 0) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const tooLarge = scanUploadTooLarge(parsed.files);
    if (tooLarge) {
      return NextResponse.json({ error: tooLarge }, { status: 413 });
    }

    const base64Images = await filesToBase64(parsed.files);
    const vision = visionScanFromParsed(parsed);
    const ocrText = readOcrTextFromForm(formData);
    const { invoice, source, memoryApplied, memoryScanCount } = await resolveInvoiceScan(
      base64Input(base64Images),
      { ...vision, locationId },
      ocrText
    );

    return NextResponse.json({
      invoice,
      pageCount: parsed.pageCount,
      panoramic: vision.panoramic || parsed.stitchedMulti,
      ...buildScanOcrMeta(source, { memoryApplied, memoryScanCount }),
    });
  } catch (err) {
    console.error("Invoice scan error:", err);
    return NextResponse.json({ error: uploadErrorMessage(err, "Scan failed") }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const { error } = await requirePermission(request, "manage_inventory");
  if (error) return error;

  try {
    const locationId = await getLocationIdFromRequest(request);
    const formData = await request.formData();
    const parsed = parseScanFormData(formData);
    const file = parsed.uploadFile;
    const vendor = formData.get("vendor") as string;
    const amount = parseFloat(formData.get("amount") as string);
    const invoiceDate = formData.get("invoiceDate") as string;
    const invoiceNumber = formData.get("invoiceNumber") as string;
    const poIdInput = (formData.get("poId") as string) || null;
    const receiptIdInput = (formData.get("receiptId") as string) || null;
    const linesJson = formData.get("lines") as string;
    const lines = linesJson ? JSON.parse(linesJson) : [];
    const pageCount = parsed.pageCount;
    const ocrSource = (formData.get("ocrSource") as string) || null;
    const originalScanJson = formData.get("originalScan") as string | null;

    let resolvedPoId = poIdInput;
    let resolvedReceiptId = receiptIdInput;
    if (!resolvedPoId) {
      const suggested = await suggestPoLinkForInvoice(locationId, vendor);
      if (suggested) {
        resolvedPoId = suggested.poId;
        resolvedReceiptId = resolvedReceiptId ?? suggested.receiptId;
      }
    }

    let imageUrl: string | null = null;
    if (file) {
      const stored = await persistUploadFile(file);
      imageUrl = stored.url;
    }

    const lineCreates = lines.map(
      (l: {
        description: string;
        qty: number;
        unit: string;
        unitPrice: number;
        lineTotal: number;
        sku?: string;
        inventoryItemId?: string;
        catchWeightBilled?: number;
        catchWeightUnit?: string;
      }) => ({
        description: l.description,
        qty: l.qty,
        unit: l.unit,
        unitPrice: l.unitPrice,
        lineTotal: l.lineTotal,
        sku: l.sku ?? null,
        inventoryItemId: l.inventoryItemId ?? null,
        catchWeightBilled: l.catchWeightBilled ?? null,
        catchWeightUnit: l.catchWeightUnit ?? null,
      })
    );

    const lineSum = lineCreates.reduce(
      (sum: number, l: { lineTotal: number }) => sum + (Number(l.lineTotal) || 0),
      0
    );
    const resolvedAmount =
      lineSum > 0 && (!Number.isFinite(amount) || amount <= 0 || Math.abs(amount - lineSum) > lineSum * 0.5)
        ? lineSum
        : amount;

    const existing =
      invoiceNumber.trim().length > 0
        ? await prisma.vendorInvoice.findFirst({
            where: { locationId, invoiceNumber: invoiceNumber.trim(), vendor },
          })
        : null;

    let saved;
    if (existing) {
      await prisma.vendorInvoiceLine.deleteMany({ where: { invoiceId: existing.id } });
      saved = await prisma.vendorInvoice.update({
        where: { id: existing.id },
        data: {
          vendor,
          amount: resolvedAmount,
          invoiceDate: invoiceDate ? new Date(invoiceDate) : existing.invoiceDate,
          invoiceNumber: invoiceNumber.trim() || existing.invoiceNumber,
          imageUrl: imageUrl ?? existing.imageUrl,
          ocrSource: ocrSource ?? existing.ocrSource,
          poId: resolvedPoId ?? existing.poId,
          receiptId: resolvedReceiptId ?? existing.receiptId,
          lines: { create: lineCreates },
        },
        include: { lines: true },
      });
    } else {
      saved = await prisma.vendorInvoice.create({
        data: {
          locationId,
          vendor,
          amount: resolvedAmount,
          category: "Food & Supplies",
          invoiceDate: invoiceDate ? new Date(invoiceDate) : new Date(),
          invoiceNumber: invoiceNumber || null,
          imageUrl,
          ocrSource,
          poId: resolvedPoId,
          receiptId: resolvedReceiptId,
          lines: { create: lineCreates },
        },
        include: { lines: true },
      });
    }

    if (originalScanJson) {
      try {
        const original = JSON.parse(originalScanJson) as InvoiceData;
        const corrected: InvoiceData = {
          vendor,
          invoiceNumber: invoiceNumber || saved.invoiceNumber || "",
          amount: resolvedAmount,
          invoiceDate: invoiceDate || saved.invoiceDate.toISOString().split("T")[0]!,
          lines: lines.map(
            (l: {
              description: string;
              qty: number;
              unit: string;
              unitPrice: number;
              lineTotal: number;
              sku?: string;
            }) => ({
              description: l.description,
              qty: l.qty,
              unit: l.unit,
              unitPrice: l.unitPrice,
              lineTotal: l.lineTotal,
              sku: l.sku,
            })
          ),
        };
        await recordInvoiceScanLearning(locationId, {
          original,
          corrected,
          ocrSource,
          invoiceId: saved.id,
        });
      } catch (learnErr) {
        console.warn("Invoice OCR learning skipped:", learnErr);
      }
    }

    const result = await processDigitizedInvoice(locationId, {
      id: saved.id,
      vendor: saved.vendor,
      amount: saved.amount,
      invoiceNumber: saved.invoiceNumber,
      invoiceDate: saved.invoiceDate,
      imageUrl: saved.imageUrl,
      poId: saved.poId,
      receiptId: saved.receiptId,
      lines: saved.lines,
    });

    return NextResponse.json({
      invoice: saved,
      match: result.match,
      priceAlerts: result.priceAlerts,
      catchWeightAlerts: result.catchWeightAlerts,
      expenseId: result.expenseId,
      inventoryUpdated: result.inventoryUpdated,
      recipesUpdated: result.recipesUpdated,
      pushNotifications: result.pushNotifications,
      pageCount,
    });
  } catch (err) {
    console.error("Invoice save error:", err);
    return NextResponse.json({ error: uploadErrorMessage(err, "Save failed") }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const { error } = await requirePermission(request, "manage_inventory");
  if (error) return error;

  const locationId = await getLocationIdFromRequest(request);
  const invoices = await prisma.vendorInvoice.findMany({
    where: { locationId },
    include: { lines: true, po: true, receipt: true },
    orderBy: { createdAt: "desc" },
    take: 30,
  });

  return NextResponse.json({ invoices });
}

export async function PATCH(request: NextRequest) {
  const { error } = await requirePermission(request, "manage_inventory");
  if (error) return error;

  try {
    const locationId = await getLocationIdFromRequest(request);
    const body = await request.json();
    const invoiceId = body.invoiceId as string;
    const poId = body.poId as string;
    if (!invoiceId || !poId) {
      return NextResponse.json({ error: "invoiceId and poId required" }, { status: 400 });
    }

    const { linkInvoiceToPo } = await import("@/lib/purchasing/invoice-linking");
    const { runThreeWayMatch } = await import("@/lib/purchasing/three-way-match");

    const invoice = await linkInvoiceToPo(
      invoiceId,
      locationId,
      poId,
      (body.receiptId as string) || null
    );
    const match = await runThreeWayMatch(invoice.id);

    return NextResponse.json({ invoice, match });
  } catch (err) {
    console.error("Invoice link error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Link failed" },
      { status: 500 }
    );
  }
}
