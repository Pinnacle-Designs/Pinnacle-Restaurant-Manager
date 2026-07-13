/** Default max width for receipt / general uploads. */
const MAX_STITCH_WIDTH = 1200;

/** Higher resolution for invoice OCR — Tesseract needs ~2000px+ for distributor tables. */
export const OCR_SCAN_MAX_WIDTH = 2800;
export const OCR_SCAN_MIN_WIDTH = 2000;

/** Stay under Vercel's ~4.5MB request body limit (leave room for multipart fields). */
export const MAX_UPLOAD_BYTES = 2_800_000;

/** Per-page cap before stitching so multi-page scans stay within server limits. */
export const MAX_PAGE_SOURCE_BYTES = 650_000;

export interface CompressUploadOptions {
  maxBytes?: number;
  /** Try these widths in order (first = preferred). */
  widths?: number[];
  qualityStart?: number;
}

/** Invoice / vendor document scans — preserve text detail for OCR. */
export const OCR_SCAN_COMPRESS: CompressUploadOptions = {
  maxBytes: MAX_UPLOAD_BYTES,
  widths: [OCR_SCAN_MAX_WIDTH, 2400, 2200, OCR_SCAN_MIN_WIDTH, 1800, 1600, 1400],
  qualityStart: 0.84,
};

export interface ScanPage {
  id: string;
  dataUrl: string;
  file: File;
}

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target?.result as string);
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}

export async function filesToScanPages(
  files: File[],
  perPageMaxBytes = MAX_PAGE_SOURCE_BYTES
): Promise<ScanPage[]> {
  return Promise.all(
    files.map(async (file) => {
      const compressed = await compressFileForUpload(file, perPageMaxBytes);
      return {
        id: crypto.randomUUID(),
        dataUrl: await readFileAsDataUrl(compressed),
        file: compressed,
      };
    })
  );
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Could not create image"))),
      "image/jpeg",
      quality
    );
  });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Could not read image"));
    reader.readAsDataURL(blob);
  });
}

/** Shrink JPEG until it fits the upload limit (for serverless body size caps). */
async function compressImageElement(
  img: HTMLImageElement,
  maxBytes: number,
  maxWidth = MAX_STITCH_WIDTH,
  qualityStart = 0.88
): Promise<{ blob: Blob; dataUrl: string; width: number; height: number }> {
  const naturalW = img.naturalWidth || img.width;
  const naturalH = img.naturalHeight || img.height;
  let width = Math.min(maxWidth, naturalW);
  let quality = qualityStart;

  for (let attempt = 0; attempt < 16; attempt++) {
    const height = Math.round((width / naturalW) * naturalH);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas not supported");

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);

    const blob = await canvasToBlob(canvas, quality);
    if (blob.size <= maxBytes) {
      return { blob, dataUrl: await blobToDataUrl(blob), width, height };
    }

    if (quality > 0.45) {
      quality -= 0.07;
    } else {
      width = Math.max(400, Math.round(width * 0.82));
      quality = 0.78;
    }
  }

  throw new Error(
    "Image is too large to upload even after compression. Try fewer pages or retake with less zoom."
  );
}

async function compressWithRetries(
  img: HTMLImageElement,
  maxBytes: number,
  widths = [MAX_STITCH_WIDTH, 1000, 850, 720, 600, 480, 400],
  qualityStart?: number
): Promise<{ blob: Blob; dataUrl: string; width: number; height: number }> {
  let lastError: Error | undefined;
  for (const width of widths) {
    try {
      return await compressImageElement(img, maxBytes, width, qualityStart);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }
  throw lastError ?? new Error("Could not compress image for upload");
}

/** Compress a camera/upload file before sending to scan APIs. */
export async function compressFileForUpload(
  file: File,
  maxBytes = MAX_UPLOAD_BYTES,
  opts: CompressUploadOptions = {}
): Promise<File> {
  const limit = Math.min(maxBytes, MAX_UPLOAD_BYTES);
  const widths = opts.widths ?? [MAX_STITCH_WIDTH, 1000, 800, 640, 520];
  const isJpeg = file.type === "image/jpeg" || /\.jpe?g$/i.test(file.name);

  // Small JPEGs at OCR-friendly resolution can skip re-encoding.
  if (isJpeg && file.size <= limit * 0.85 && !opts.widths) {
    return file;
  }

  const img = await loadImage(await readFileAsDataUrl(file));
  const naturalW = img.naturalWidth || img.width;
  if (isJpeg && file.size <= limit * 0.92 && naturalW >= OCR_SCAN_MIN_WIDTH && opts.widths) {
    return file;
  }

  const { blob } = await compressWithRetries(img, limit, widths, opts.qualityStart);
  const base = file.name.replace(/\.[^.]+$/, "") || "scan";
  return blobToFile(blob, `${base}.jpg`);
}

/** Compress for invoice / PO document OCR (higher resolution). */
export async function compressFileForDocumentScan(file: File): Promise<File> {
  return compressFileForUpload(file, MAX_UPLOAD_BYTES, OCR_SCAN_COMPRESS);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load image"));
    img.src = src;
  });
}

/**
 * Stack document page images top-to-bottom into one long panoramic image.
 * Pages are scaled to a common width while preserving aspect ratio.
 */
export async function stitchDocumentPanorama(
  sources: string[],
  maxBytes = MAX_UPLOAD_BYTES
): Promise<{ dataUrl: string; blob: Blob; width: number; height: number }> {
  if (sources.length === 0) {
    throw new Error("No pages to stitch");
  }

  const images = await Promise.all(sources.map(loadImage));
  const targetWidth = Math.min(
    OCR_SCAN_MAX_WIDTH,
    Math.max(...images.map((img) => img.naturalWidth || img.width))
  );

  const scaledHeights = images.map((img) => {
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    return (targetWidth / w) * h;
  });
  const totalHeight = Math.round(scaledHeights.reduce((sum, h) => sum + h, 0));

  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = totalHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, targetWidth, totalHeight);

  let y = 0;
  for (let i = 0; i < images.length; i++) {
    const img = images[i];
    const h = scaledHeights[i];
    ctx.drawImage(img, 0, y, targetWidth, h);
    y += h;
  }

  const tempImg = await loadImage(canvas.toDataURL("image/jpeg", 0.85));
  const pageCount = sources.length;
  const stitchWidths =
    pageCount >= 4
      ? [2200, 2000, 1800, 1600, 1400, 1200, 1000, 850]
      : pageCount >= 2
        ? [OCR_SCAN_MAX_WIDTH, 2400, 2200, 2000, 1800, 1600, 1400, 1200]
        : [OCR_SCAN_MAX_WIDTH, 2400, 2200, OCR_SCAN_MIN_WIDTH, 1800, 1600];

  const compressed = await compressWithRetries(tempImg, maxBytes, stitchWidths);

  return {
    dataUrl: compressed.dataUrl,
    blob: compressed.blob,
    width: compressed.width,
    height: compressed.height,
  };
}

export const stitchReceiptPanorama = stitchDocumentPanorama;

export function blobToFile(blob: Blob, filename: string): File {
  return new File([blob], filename, { type: blob.type || "image/jpeg" });
}

/** Client-side guard before multipart upload. */
export function assertUploadSize(file: File, label = "Image"): void {
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error(
      `${label} is too large to upload (${(file.size / 1_000_000).toFixed(1)}MB). Try fewer pages or retake with less zoom.`
    );
  }
}
