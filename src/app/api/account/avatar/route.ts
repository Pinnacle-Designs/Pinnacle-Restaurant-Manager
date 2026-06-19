import { NextRequest } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { v4 as uuidv4 } from "uuid";
import { prisma } from "@/lib/prisma";
import { createSessionToken, sessionCookieOptions } from "@/lib/auth";
import { requireSecureAuth } from "@/lib/api-auth";
import { isRateLimited } from "@/lib/rate-limit";
import { matchesDeclaredImageType } from "@/lib/image-validation";
import { privateJsonResponse } from "@/lib/secure-response";

const MAX_BYTES = 2 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function POST(request: NextRequest) {
  const { user, error } = await requireSecureAuth(request);
  if (error) return error;

  if (await isRateLimited(`avatar:${user!.id}`, 10, 60_000)) {
    return privateJsonResponse(
      { error: "Too many upload attempts. Try again shortly." },
      { status: 429 }
    );
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return privateJsonResponse({ error: "No file provided" }, { status: 400 });
    }

    if (!ALLOWED_TYPES.has(file.type)) {
      return privateJsonResponse(
        { error: "Use a JPEG, PNG, or WebP image" },
        { status: 400 }
      );
    }

    if (file.size > MAX_BYTES) {
      return privateJsonResponse({ error: "Image must be under 2 MB" }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    if (!matchesDeclaredImageType(buffer, file.type)) {
      return privateJsonResponse({ error: "Invalid image file" }, { status: 400 });
    }

    const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
    const filename = `avatar-${user!.id}-${uuidv4()}.${ext}`;

    const uploadsDir = join(process.cwd(), "public", "uploads", "avatars");
    await mkdir(uploadsDir, { recursive: true });
    await writeFile(join(uploadsDir, filename), buffer);

    const avatarUrl = `/uploads/avatars/${filename}`;

    const updated = await prisma.user.update({
      where: { id: user!.id },
      data: { avatarUrl },
      select: { avatarUrl: true },
    });

    const response = privateJsonResponse({ avatarUrl: updated.avatarUrl });
    const token = await createSessionToken({
      ...user!,
      avatarUrl: updated.avatarUrl,
    });
    response.cookies.set(sessionCookieOptions(token));
    return response;
  } catch (err) {
    console.error("Avatar upload error:", err);
    return privateJsonResponse({ error: "Upload failed" }, { status: 500 });
  }
}
