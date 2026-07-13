/** Browser-only image preprocessing to improve Tesseract accuracy on crumpled invoices. */

const OCR_MIN_WIDTH = 1800;
const OCR_MAX_WIDTH = 2800;

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

/** Upscale + mild contrast + binarize for document OCR. */
export async function preprocessImageFileForOcr(file: File): Promise<Blob> {
  return preprocessImageVariant(file, { threshold: true });
}

/** Grayscale + contrast only — keeps faint table rules and colored stamps readable. */
export async function preprocessImageFileSoftForOcr(file: File): Promise<Blob> {
  return preprocessImageVariant(file, { threshold: false, contrastBoost: 1.0 });
}

/** Strong contrast without hard binarize — helps phone photos in uneven light. */
export async function preprocessImageFileHighContrastForOcr(file: File): Promise<Blob> {
  return preprocessImageVariant(file, { threshold: false, contrastBoost: 1.35, stretchPercentile: 0.02 });
}

async function preprocessImageVariant(
  file: File,
  opts: { threshold: boolean; contrastBoost?: number; stretchPercentile?: number }
): Promise<Blob> {
  if (typeof document === "undefined") return file;

  const bitmap = await createImageBitmap(file);
  try {
    const targetWidth = clamp(Math.max(bitmap.width, OCR_MIN_WIDTH), OCR_MIN_WIDTH, OCR_MAX_WIDTH);
    const scale = targetWidth / bitmap.width;
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(bitmap, 0, 0, width, height);

    const imageData = ctx.getImageData(0, 0, width, height);
    const gray = toGrayscale(imageData.data, width, height);
    const sorted = [...gray].sort((a, b) => a - b);
    const pct = opts.stretchPercentile ?? 0.03;
    const low = sorted[Math.floor(sorted.length * pct)] ?? 0;
    const high = sorted[Math.floor(sorted.length * (1 - pct))] ?? 255;
    const threshold = otsuThreshold(gray);
    const boost = opts.contrastBoost ?? 1.0;

    const out = ctx.createImageData(width, height);
    for (let i = 0; i < width * height; i += 1) {
      const idx = i * 4;
      let enhanced = stretchContrast(gray[i]!, low, high);
      if (boost !== 1) {
        enhanced = clamp(Math.round((enhanced - 128) * boost + 128), 0, 255);
      }
      const value = opts.threshold ? (enhanced > threshold ? 255 : 0) : enhanced;
      out.data[idx] = value;
      out.data[idx + 1] = value;
      out.data[idx + 2] = value;
      out.data[idx + 3] = 255;
    }
    ctx.putImageData(out, 0, 0);

    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("Failed to preprocess image"))),
        "image/png",
        1
      );
    });
  } finally {
    bitmap.close();
  }
}
