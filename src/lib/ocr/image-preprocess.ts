/** Browser-only image preprocessing to improve Tesseract accuracy on crumpled invoices. */

const OCR_MIN_WIDTH = 2000;
const OCR_MAX_WIDTH = 3600;
const STRIP_HEIGHT = 2800;
const STRIP_OVERLAP = 200;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function stretchContrast(gray: number, low: number, high: number): number {
  if (high <= low) return gray;
  const stretched = ((gray - low) / (high - low)) * 255;
  return clamp(Math.round(stretched), 0, 255);
}

function toGrayscale(data: Uint8ClampedArray, width: number, height: number): Uint8ClampedArray {
  const gray = new Uint8ClampedArray(width * height);
  for (let i = 0; i < width * height; i += 1) {
    const idx = i * 4;
    gray[i] = Math.round(data[idx]! * 0.299 + data[idx + 1]! * 0.587 + data[idx + 2]! * 0.114);
  }
  return gray;
}

function otsuThreshold(gray: Uint8ClampedArray): number {
  const histogram = new Array<number>(256).fill(0);
  for (const value of gray) histogram[value]! += 1;

  const total = gray.length;
  let sum = 0;
  for (let i = 0; i < 256; i += 1) sum += i * histogram[i]!;
  let sumB = 0;
  let wB = 0;
  let maxVariance = 0;
  let threshold = 128;

  for (let t = 0; t < 256; t += 1) {
    wB += histogram[t]!;
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * histogram[t]!;
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const variance = wB * wF * (mB - mF) ** 2;
    if (variance > maxVariance) {
      maxVariance = variance;
      threshold = t;
    }
  }
  return threshold;
}

function contrastBounds(gray: Uint8ClampedArray): { low: number; high: number } {
  const sorted = [...gray].sort((a, b) => a - b);
  return {
    low: sorted[Math.floor(sorted.length * 0.02)] ?? 0,
    high: sorted[Math.floor(sorted.length * 0.98)] ?? 255,
  };
}

function grayToImageData(gray: Uint8ClampedArray, width: number, height: number, binarize: boolean): ImageData {
  const { low, high } = contrastBounds(gray);
  const threshold = binarize ? otsuThreshold(gray) : 0;
  const out = new Uint8ClampedArray(width * height * 4);

  for (let i = 0; i < width * height; i += 1) {
    const idx = i * 4;
    const enhanced = stretchContrast(gray[i]!, low, high);
    const value = binarize ? (enhanced > threshold ? 255 : 0) : enhanced;
    out[idx] = value;
    out[idx + 1] = value;
    out[idx + 2] = value;
    out[idx + 3] = 255;
  }

  return new ImageData(out, width, height);
}

async function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Failed to export OCR image"))),
      "image/png",
      1
    );
  });
}

async function renderScaledBitmap(bitmap: ImageBitmap, binarize: boolean): Promise<Blob> {
  const targetWidth = clamp(Math.max(bitmap.width, OCR_MIN_WIDTH), OCR_MIN_WIDTH, OCR_MAX_WIDTH);
  const scale = targetWidth / bitmap.width;
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);

  const imageData = ctx.getImageData(0, 0, width, height);
  const gray = toGrayscale(imageData.data, width, height);
  ctx.putImageData(grayToImageData(gray, width, height, binarize), 0, 0);

  return canvasToBlob(canvas);
}

async function renderStrip(bitmap: ImageBitmap, top: number, height: number, binarize: boolean): Promise<Blob> {
  const targetWidth = clamp(Math.max(bitmap.width, OCR_MIN_WIDTH), OCR_MIN_WIDTH, OCR_MAX_WIDTH);
  const scale = targetWidth / bitmap.width;
  const width = Math.round(bitmap.width * scale);
  const scaledHeight = Math.round(height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = scaledHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, scaledHeight);
  ctx.drawImage(bitmap, 0, top, bitmap.width, height, 0, 0, width, scaledHeight);

  const imageData = ctx.getImageData(0, 0, width, scaledHeight);
  const gray = toGrayscale(imageData.data, width, scaledHeight);
  ctx.putImageData(grayToImageData(gray, width, scaledHeight, binarize), 0, 0);

  return canvasToBlob(canvas);
}

/** Upscale and binarize a photo before OCR (returns PNG blob). */
export async function preprocessImageFileForOcr(file: File): Promise<Blob> {
  if (typeof document === "undefined") return file;
  const bitmap = await createImageBitmap(file);
  try {
    return await renderScaledBitmap(bitmap, true);
  } finally {
    bitmap.close();
  }
}

/** Grayscale + contrast only — preserves faint thermal print. */
export async function preprocessImageFileGrayscale(file: File): Promise<Blob> {
  if (typeof document === "undefined") return file;
  const bitmap = await createImageBitmap(file);
  try {
    return await renderScaledBitmap(bitmap, false);
  } finally {
    bitmap.close();
  }
}

/** Split very tall invoices into overlapping strips for sharper OCR. */
export async function segmentImageFileForOcr(file: File): Promise<Blob[]> {
  if (typeof document === "undefined") return [file];

  const bitmap = await createImageBitmap(file);
  try {
    if (bitmap.height <= STRIP_HEIGHT * 1.2) {
      return [await renderScaledBitmap(bitmap, true), await renderScaledBitmap(bitmap, false)];
    }

    const strips: Blob[] = [];
    let top = 0;
    while (top < bitmap.height) {
      const height = Math.min(STRIP_HEIGHT, bitmap.height - top);
      strips.push(await renderStrip(bitmap, top, height, true));
      strips.push(await renderStrip(bitmap, top, height, false));
      if (top + height >= bitmap.height) break;
      top += STRIP_HEIGHT - STRIP_OVERLAP;
    }
    return strips;
  } finally {
    bitmap.close();
  }
}
