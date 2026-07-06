import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isInvoiceOcrConfigured } from "@/lib/ai/analyze-invoice";
import { getLocationIdFromRequest } from "@/lib/location";
import { requirePermission } from "@/lib/api-auth";
import { processDigitizedInvoice } from "@/lib/purchasing/invoice-digitization";
import { persistUploadFile, uploadErrorMessage } from "@/lib/persist-upload";
import { resolveInvoiceScan } from "@/lib/ocr/resolve-scan";
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
    const { invoice, source } = await resolveInvoiceScan(
      base64Input(base64Images),
      vision,
      ocrText
    );

    return NextResponse.json({
      invoice,
      pageCount: parsed.pageCount,
      panoramic: vision.panoramic || parsed.stitchedMulti,
      ocrConfigured: isInvoiceOcrConfigured(),
      ocrSource: source,
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
    const poId = (formData.get("poId") as string) || null;
    const receiptId = (formData.get("receiptId") as string) || null;
    const linesJson = formData.get("lines") as string;
    const lines = linesJson ? JSON.parse(linesJson) : [];
    const pageCount = parsed.pageCount;

    let imageUrl: string | null = null;
    if (file) {
      const stored = await persistUploadFile(file);
      imageUrl = stored.url;
    }

    const saved = await prisma.vendorInvoice.create({
      data: {
        locationId,
        vendor,
        amount,
        category: "Food & Supplies",
        invoiceDate: invoiceDate ? new Date(invoiceDate) : new Date(),
        invoiceNumber: invoiceNumber || null,
        imageUrl,
        poId,
        receiptId,
        lines: {
          create: lines.map(
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
          ),
        },
      },
      include: { lines: true },
    });

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
