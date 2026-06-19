import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { v4 as uuidv4 } from "uuid";
import { prisma } from "@/lib/prisma";
import { analyzeReceipt } from "@/lib/ai";
import { getLocationIdFromRequest } from "@/lib/location";
import { requirePermission } from "@/lib/api-auth";
import type { PhotoCategory } from "@prisma/client";

async function fileToBase64(file: File): Promise<string> {
  const buffer = Buffer.from(await file.arrayBuffer());
  return buffer.toString("base64");
}

export async function POST(request: NextRequest) {
  const { error } = await requirePermission(request, "view_receipts");
  if (error) return error;

  try {
    const formData = await request.formData();
    const multiFiles = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
    const singleFile = formData.get("file");
    const file = singleFile instanceof File && singleFile.size > 0 ? singleFile : null;

    const files = multiFiles.length > 0 ? multiFiles : file ? [file] : [];

    if (files.length === 0) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const base64Images = await Promise.all(files.map(fileToBase64));
    const panoramic =
      formData.get("panoramic") === "true" || formData.get("scanMode") === "panorama";
    const receipt = await analyzeReceipt(
      base64Images.length === 1 ? base64Images[0] : base64Images,
      { panoramic: panoramic && base64Images.length === 1 }
    );

    return NextResponse.json({
      receipt,
      pageCount: files.length,
      panoramic: panoramic || files.length > 1,
    });
  } catch (error) {
    console.error("Receipt scan error:", error);
    return NextResponse.json({ error: "Scan failed" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const { error } = await requirePermission(request, "view_receipts");
  if (error) return error;

  try {
    const locationId = await getLocationIdFromRequest(request);
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const description = formData.get("description") as string;
    const amount = parseFloat(formData.get("amount") as string);
    const category = formData.get("category") as string;
    const date = formData.get("date") as string;
    const pageCount = parseInt(String(formData.get("pageCount") || "1"), 10);
    const panoramic =
      formData.get("panoramic") === "true" || formData.get("scanMode") === "panorama";

    let receiptUrl: string | null = null;

    if (file) {
      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);
      const ext = file.name.split(".").pop() || "jpg";
      const filename = `${uuidv4()}.${ext}`;
      const uploadsDir = join(process.cwd(), "public", "uploads");
      await mkdir(uploadsDir, { recursive: true });
      await writeFile(join(uploadsDir, filename), buffer);
      receiptUrl = `/uploads/${filename}`;

      await prisma.photo.create({
        data: {
          locationId,
          filename,
          url: receiptUrl,
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
