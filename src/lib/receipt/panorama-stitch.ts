/** Max width for stitched document images (keeps uploads reasonable). */
const MAX_STITCH_WIDTH = 1200;

/** Stay under Vercel's ~4.5MB request body limit (leave room for form fields). */
export const MAX_UPLOAD_BYTES = 3_500_000;

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

export async function filesToScanPages(files: File[]): Promise<ScanPage[]> {
  return Promise.all(
    files.map(async (file) => ({
      id: crypto.randomUUID(),
      dataUrl: await readFileAsDataUrl(file),
      file,
    }))
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
  maxWidth = MAX_STITCH_WIDTH
): Promise<{ blob: Blob; dataUrl: string; width: number; height: number }> {
  const naturalW = img.naturalWidth || img.width;
  const naturalH = img.naturalHeight || img.height;
  let width = Math.min(maxWidth, naturalW);
  let quality = 0.88;

  for (let attempt = 0; attempt < 14; attempt++) {
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

    if (quality > 0.52) {
      quality -= 0.08;
    } else {
      width = Math.max(480, Math.round(width * 0.85));
      quality = 0.82;
    }
  }

  throw new Error(
    "Image is too large to upload even after compression. Try fewer pages or retake with less zoom."
  );
}

/** Compress a camera/upload file before sending to scan APIs. */
export async function compressFileForUpload(
  file: File,
  maxBytes = MAX_UPLOAD_BYTES
): Promise<File> {
  if (file.size <= maxBytes && file.type === "image/jpeg") {
    return file;
  }
  const img = await loadImage(await readFileAsDataUrl(file));
  const { blob } = await compressImageElement(img, maxBytes);
  const base = file.name.replace(/\.[^.]+$/, "") || "scan";
  return blobToFile(blob, `${base}.jpg`);
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
  sources: string[]
): Promise<{ dataUrl: string; blob: Blob; width: number; height: number }> {
  if (sources.length === 0) {
    throw new Error("No pages to stitch");
  }

  const images = await Promise.all(sources.map(loadImage));
  const targetWidth = Math.min(
    MAX_STITCH_WIDTH,
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

  const tempImg = await loadImage(canvas.toDataURL("image/jpeg", 0.88));
  const compressed = await compressImageElement(tempImg, MAX_UPLOAD_BYTES, targetWidth);

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
