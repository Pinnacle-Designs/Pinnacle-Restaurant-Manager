import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { analyzePhoto } from "@/lib/ai";
import { getLocationIdFromRequest } from "@/lib/location";
import { getSessionUserFromRequest } from "@/lib/auth";
import { userCan } from "@/lib/permission-resolve";
import { forbiddenResponse, unauthorizedResponse } from "@/lib/api-auth";
import { getRequestPlan } from "@/lib/plan-api";
import {
  GROWTH_OCR_MONTHLY_LIMIT,
  PLAN_BY_ID,
  canUseReceiptOcr,
  hasUnlimitedReceiptOcr,
} from "@/lib/plans";
import { startOfMonth } from "date-fns";
import type { PhotoCategory } from "@prisma/client";
import { persistUploadFile, uploadErrorMessage } from "@/lib/persist-upload";
import { autoDigitizePhotoUpload } from "@/lib/photos/auto-digitize";
import {
  base64Input,
  filesToBase64,
  parseScanFormData,
  readOcrTextFromForm,
  scanUploadTooLarge,
  visionScanFromParsed,
} from "@/lib/scan/parse-scan-form";

const DIGITIZE_CATEGORIES = new Set(["RECEIPT", "VENDOR_INVOICE"]);

export async function GET(request: NextRequest) {
  const user = await getSessionUserFromRequest(request);
  if (!user) return unauthorizedResponse();

  const locationId = await getLocationIdFromRequest(request);
  const category = request.nextUrl.searchParams.get("category");
  const canViewReceipts = await userCan(user, "view_receipts");
  const canManageInventory = await userCan(user, "manage_inventory");

  if (category === "RECEIPT" && !canViewReceipts) {
    return forbiddenResponse();
  }
  if (category === "VENDOR_INVOICE" && !canManageInventory) {
    return forbiddenResponse();
  }

  const photos = await prisma.photo.findMany({
    where: {
      locationId,
      ...(category ? { category: category as PhotoCategory } : {}),
      ...(!canViewReceipts ? { category: { not: "RECEIPT" as PhotoCategory } } : {}),
      ...(!canManageInventory ? { category: { not: "VENDOR_INVOICE" as PhotoCategory } } : {}),
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(photos);
}

export async function POST(request: NextRequest) {
  try {
    const user = await getSessionUserFromRequest(request);
    if (!user) return unauthorizedResponse();

    const locationId = await getLocationIdFromRequest(request);
    const formData = await request.formData();
    const parsed = parseScanFormData(formData);
    const category = (formData.get("category") as string) || "OTHER";

    if (category === "RECEIPT" && !(await userCan(user, "view_receipts"))) {
      return forbiddenResponse();
    }
    if (category === "VENDOR_INVOICE" && !(await userCan(user, "manage_inventory"))) {
      return forbiddenResponse();
    }

    const title = formData.get("title") as string | null;
    const description = formData.get("description") as string | null;
    const analyzeWithAI = formData.get("analyzeWithAI") === "true";

    if (parsed.files.length === 0) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const tooLarge = scanUploadTooLarge(parsed.files);
    if (tooLarge) {
      return NextResponse.json({ error: tooLarge }, { status: 413 });
    }

    const uploadFile = parsed.uploadFile ?? parsed.files[0];
    if (!uploadFile) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const { url, filename } = await persistUploadFile(uploadFile);
    let aiAnalysis: string | null = null;
    let photoTitle = title;
    let tags: string[] = [];
    let digitized = null;

    if (analyzeWithAI && DIGITIZE_CATEGORIES.has(category)) {
      if (category === "RECEIPT") {
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
      }

      const ocrText = readOcrTextFromForm(formData);
      const result = await autoDigitizePhotoUpload({
        locationId,
        category,
        imageUrl: url,
        parsed,
        ocrText,
        title,
      });
      aiAnalysis = result.aiAnalysis;
      photoTitle = result.photoTitle ?? photoTitle;
      tags = result.tags;
      digitized = result.digitized ?? null;
    } else if (analyzeWithAI) {
      const base64Images = await filesToBase64(parsed.files);
      const vision = visionScanFromParsed(parsed);
      const analysis = await analyzePhoto(base64Input(base64Images), category, vision);
      aiAnalysis = analysis.description;
      tags = analysis.tags;
      if (!photoTitle) photoTitle = analysis.suggestedTitle;
    }

    const photo = await prisma.photo.create({
      data: {
        locationId,
        filename,
        url,
        category: category as PhotoCategory,
        title: photoTitle,
        description,
        tags: JSON.stringify(tags),
        aiAnalysis,
      },
    });

    await prisma.activityLog.create({
      data: {
        locationId,
        action: "PHOTO_UPLOAD",
        entity: "photo",
        entityId: photo.id,
        details: digitized
          ? `Uploaded & digitized ${category} photo: ${photoTitle || filename}`
          : `Uploaded ${category} photo: ${photoTitle || filename}`,
      },
    });

    return NextResponse.json({ photo, digitized });
  } catch (error) {
    console.error("Photo upload error:", error);
    return NextResponse.json({ error: uploadErrorMessage(error) }, { status: 500 });
  }
}
