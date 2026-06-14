import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { v4 as uuidv4 } from "uuid";
import { prisma } from "@/lib/prisma";
import { createSessionToken, sessionCookieOptions } from "@/lib/auth";
import { requireAuth } from "@/lib/api-auth";

const MAX_BYTES = 2 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function POST(request: NextRequest) {
  const { user, error } = await requireAuth(request);
  if (error) return error;

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json(
        { error: "Use a JPEG, PNG, or WebP image" },
        { status: 400 }
      );
    }

    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "Image must be under 2 MB" }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
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

    const response = NextResponse.json({ avatarUrl: updated.avatarUrl });
    const token = await createSessionToken({
      ...user!,
      avatarUrl: updated.avatarUrl,
    });
    response.cookies.set(sessionCookieOptions(token));
    return response;
  } catch (err) {
    console.error("Avatar upload error:", err);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
