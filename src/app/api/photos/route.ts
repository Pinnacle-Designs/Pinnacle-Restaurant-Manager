import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { v4 as uuidv4 } from "uuid";
import { prisma } from "@/lib/prisma";
import { analyzePhoto } from "@/lib/ai";
import { getLocationIdFromRequest } from "@/lib/location";
import { getSessionUserFromRequest } from "@/lib/auth";
import { userCan } from "@/lib/permission-resolve";
import { forbiddenResponse, unauthorizedResponse } from "@/lib/api-auth";
import type { PhotoCategory } from "@prisma/client";
import {
  base64Input,
  filesToBase64,
  parseScanFormData,
  visionScanFromParsed,
} from "@/lib/scan/parse-scan-form";

export async function GET(request: NextRequest) {
  const user = await getSessionUserFromRequest(request);
  if (!user) return unauthorizedResponse();

  const locationId = await getLocationIdFromRequest(request);
  const category = request.nextUrl.searchParams.get("category");

  if (category === "RECEIPT" && !(await userCan(user, "view_receipts"))) {
    return forbiddenResponse();
  }

  const photos = await prisma.photo.findMany({
    where: {
      locationId,
      ...(category ? { category: category as PhotoCategory } : {}),
      ...(!(await userCan(user, "view_receipts"))
        ? { category: { not: "RECEIPT" as PhotoCategory } }
        : {}),
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
    const title = formData.get("title") as string | null;
    const description = formData.get("description") as string | null;
    const analyzeWithAI = formData.get("analyzeWithAI") === "true";

    if (parsed.files.length === 0) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const uploadFile = parsed.uploadFile ?? parsed.files[0];
    const buffer = Buffer.from(await uploadFile.arrayBuffer());
    const ext = uploadFile.name.split(".").pop() || "jpg";
    const filename = `${uuidv4()}.${ext}`;

    const uploadsDir = join(process.cwd(), "public", "uploads");
    await mkdir(uploadsDir, { recursive: true });
    await writeFile(join(uploadsDir, filename), buffer);

    const url = `/uploads/${filename}`;
    let aiAnalysis: string | null = null;
    let photoTitle = title;
    let tags: string[] = [];

    if (analyzeWithAI) {
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
        details: `Uploaded ${category} photo: ${photoTitle || filename}`,
      },
    });

    return NextResponse.json(photo);
  } catch (error) {
    console.error("Photo upload error:", error);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
