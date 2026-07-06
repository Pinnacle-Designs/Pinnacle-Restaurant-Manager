import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { v4 as uuidv4 } from "uuid";
import { MAX_UPLOAD_BYTES } from "@/lib/receipt/panorama-stitch";

export type UploadStorageMode = "disk" | "inline";

export class UploadStorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UploadStorageError";
  }
}

/** True on Vercel / Lambda where `public/uploads` is not writable. */
export function isEphemeralServerFilesystem(): boolean {
  return process.env.VERCEL === "1" || Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME);
}

function mimeForExt(ext: string): string {
  const lower = ext.toLowerCase().replace(/^\./, "");
  if (lower === "png") return "image/png";
  if (lower === "webp") return "image/webp";
  if (lower === "gif") return "image/gif";
  return "image/jpeg";
}

function publicUploadPath(filename: string, subdir?: string): string {
  const parts = ["/uploads", subdir?.replace(/^\/|\/$/g, ""), filename].filter(Boolean);
  return parts.join("/");
}

/**
 * Persist an uploaded image buffer.
 * - Local dev: writes under `public/uploads`
 * - Serverless: stores as inline data URL in DB (demo-friendly; survives across requests)
 */
export async function persistUploadBuffer(
  buffer: Buffer,
  ext = "jpg",
  subdir?: string
): Promise<{ url: string; filename: string; storage: UploadStorageMode }> {
  const safeExt = ext.replace(/^\./, "") || "jpg";
  const filename = `${uuidv4()}.${safeExt}`;

  if (!isEphemeralServerFilesystem()) {
    const uploadsDir = join(process.cwd(), "public", "uploads", subdir ?? "");
    await mkdir(uploadsDir, { recursive: true });
    await writeFile(join(uploadsDir, filename), buffer);
    return {
      url: publicUploadPath(filename, subdir),
      filename,
      storage: "disk",
    };
  }

  if (buffer.length > MAX_UPLOAD_BYTES) {
    throw new UploadStorageError(
      `Image is too large (${(buffer.length / 1_000_000).toFixed(1)}MB). Retake at a lower zoom or resolution.`
    );
  }

  const url = `data:${mimeForExt(safeExt)};base64,${buffer.toString("base64")}`;
  return { url, filename, storage: "inline" };
}

export async function persistUploadFile(
  file: File,
  subdir?: string
): Promise<{ url: string; filename: string; storage: UploadStorageMode }> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const ext = file.name.split(".").pop() || "jpg";
  return persistUploadBuffer(buffer, ext, subdir);
}

export function uploadErrorMessage(err: unknown, fallback = "Upload failed"): string {
  if (err instanceof UploadStorageError) return err.message;
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}
