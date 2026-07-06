import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getLocationIdFromRequest } from "@/lib/location";
import { requirePermission } from "@/lib/api-auth";
import { getRequestPlan } from "@/lib/plan-api";
import { persistUploadFile, uploadErrorMessage } from "@/lib/persist-upload";
import { resolveReceiptScan } from "@/lib/ocr/resolve-scan";
import { buildScanOcrMeta } from "@/lib/ocr/scan-response";
import {
  GROWTH_OCR_MONTHLY_LIMIT,
  PLAN_BY_ID,
  canUseReceiptOcr,
  hasUnlimitedReceiptOcr,
} from "@/lib/plans";
import { startOfMonth } from "date-fns";
import type { PhotoCategory } from "@prisma/client";
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
  const { error } = await requirePermission(request, "view_receipts");
  if (error) return error;

  const plan = await getRequestPlan(request);
  if (!canUseReceiptOcr(plan)) {
    return NextResponse.json(
      {
        error: `Receipt OCR is included on ${PLAN_BY_ID.GROWTH.name} and ${PLAN_BY_ID.PRO.name} plans.`,
        requiredPlan: "GROWTH",
      },
      { status: 403 }
    );
  }

  if (!hasUnlimitedReceiptOcr(plan)) {
    const locationId = await getLocationIdFromRequest(request);
    const monthStart = startOfMonth(new Date());
    const used = await prisma.photo.count({
      where: {
        locationId,
        category: "RECEIPT",
        createdAt: { gte: monthStart },
      },
    });
    if (used >= GROWTH_OCR_MONTHLY_LIMIT) {
      return NextResponse.json(
        {
          error: `Growth includes ${GROWTH_OCR_MONTHLY_LIMIT} receipt scans per month. Upgrade to ${PLAN_BY_ID.PRO.name} for unlimited OCR.`,
          requiredPlan: "PRO",
        },
        { status: 429 }
      );
    }
  }

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
    const { receipt, source } = await resolveReceiptScan(
      base64Input(base64Images),
      vision,
      ocrText
    );

    return NextResponse.json({
      receipt,
      pageCount: parsed.pageCount,
      panoramic: vision.panoramic || parsed.stitchedMulti,
      ...buildScanOcrMeta(source),
    });
  } catch (error) {
    console.error("Receipt scan error:", error);
    return NextResponse.json({ error: uploadErrorMessage(error, "Scan failed") }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const { error } = await requirePermission(request, "view_receipts");
  if (error) return error;

  try {
    const locationId = await getLocationIdFromRequest(request);
    const formData = await request.formData();
    const parsed = parseScanFormData(formData);
    const file = parsed.uploadFile;
    const description = formData.get("description") as string;
    const amount = parseFloat(formData.get("amount") as string);
    const category = formData.get("category") as string;
    const date = formData.get("date") as string;
    const pageCount = parsed.pageCount;
    const panoramic = parsed.panoramic;

    let receiptUrl: string | null = null;

    if (file) {
      const stored = await persistUploadFile(file);
      receiptUrl = stored.url;

      await prisma.photo.create({
        data: {
          locationId,
          filename: stored.filename,
          url: stored.url,
          category: "RECEIPT" as PhotoCategory,
          title: description,
          description:
            pageCount > 1
              ? `Panoramic receipt (${pageCount} pages): ${description}`
              : panoramic
                ? `Panoramic receipt: ${description}`
                : `Receipt: ${description}`,
        },
      });
    }

    const expense = await prisma.expense.create({
      data: {
        locationId,
        description,
        amount,
        category,
        date: date ? new Date(date) : new Date(),
        receiptUrl,
      },
    });

    await prisma.activityLog.create({
      data: {
        locationId,
        action: "RECEIPT_OCR",
        entity: "expense",
        entityId: expense.id,
        details:
          pageCount > 1
            ? `Panoramic receipt (${pageCount} pages): ${description} $${amount}`
            : panoramic
              ? `Panoramic receipt scan: ${description} $${amount}`
              : `Receipt scanned: ${description} $${amount}`,
      },
    });

    return NextResponse.json({ expense });
  } catch (error) {
    console.error("Receipt save error:", error);
    return NextResponse.json({ error: "Save failed" }, { status: 500 });
  }
}
