import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { v4 as uuidv4 } from "uuid";

const MAX_BYTES = 2_500_000;

export async function savePunchPhoto(dataUrl: string): Promise<string> {
  const match = dataUrl.match(/^data:image\/(jpeg|jpg|png|webp);base64,(.+)$/i);
  if (!match) {
    throw new Error("Invalid punch photo format");
  }

  const ext = match[1].toLowerCase() === "jpg" ? "jpeg" : match[1].toLowerCase();
  const buffer = Buffer.from(match[2], "base64");

  if (buffer.length > MAX_BYTES) {
    throw new Error("Punch photo is too large");
  }
  if (buffer.length < 1024) {
    throw new Error("Punch photo is too small — retake the photo");
  }

  const filename = `punch-${uuidv4()}.${ext}`;
  const uploadsDir = join(process.cwd(), "public", "uploads", "punches");
  await mkdir(uploadsDir, { recursive: true });
  await writeFile(join(uploadsDir, filename), buffer);

  return `/uploads/punches/${filename}`;
}
