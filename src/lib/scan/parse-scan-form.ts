import type { DocumentScanMode } from "@/components/scan/DocumentScanModeToggle";

export interface ParsedScanForm {
  files: File[];
  /** Primary file for storage — prefers explicit `file` field from client. */
  uploadFile: File | null;
  scanMode: DocumentScanMode;
  panoramic: boolean;
  pageCount: number;
  /** Client stitched multiple pages into one JPEG before upload. */
  stitchedMulti: boolean;
}

export function parseScanFormData(formData: FormData): ParsedScanForm {
  const multiFiles = formData
    .getAll("files")
    .filter((f): f is File => f instanceof File && f.size > 0);
  const singleFile = formData.get("file");
  const explicitFile = singleFile instanceof File && singleFile.size > 0 ? singleFile : null;

  // Prefer the single compressed upload (stitched or single-page) over legacy multi-file arrays.
  const files = explicitFile ? [explicitFile] : multiFiles.length > 0 ? multiFiles : [];

  const scanMode = (formData.get("scanMode") as DocumentScanMode) || "single";
  const pageCountParam = parseInt(String(formData.get("pageCount") || "0"), 10);
  const pageCount = pageCountParam > 0 ? pageCountParam : Math.max(1, files.length);

  const panoramicFlag = formData.get("panoramic") === "true";
  const stitchedMulti = pageCount > 1 && files.length === 1;
  const panoramic =
    panoramicFlag ||
    scanMode === "panorama" ||
    scanMode === "multi" ||
    stitchedMulti ||
    files.length > 1;

  return {
    files,
    uploadFile: explicitFile ?? files[0] ?? null,
    scanMode,
    panoramic,
    pageCount,
    stitchedMulti,
  };
}

/** Vision/OCR flags for a parsed upload (single stitched image vs true multi-image). */
export function visionScanFromParsed(parsed: ParsedScanForm): {
  panoramic: boolean;
  multiPage: boolean;
  pageCount: number;
} {
  const multiImage = parsed.files.length > 1;
  return {
    multiPage: multiImage,
    panoramic: !multiImage && (parsed.panoramic || parsed.stitchedMulti),
    pageCount: parsed.pageCount,
  };
}

export async function filesToBase64(files: File[]): Promise<string[]> {
  return Promise.all(
    files.map(async (file) => {
      const buffer = Buffer.from(await file.arrayBuffer());
      return buffer.toString("base64");
    })
  );
}

export function base64Input(images: string[]): string | string[] {
  return images.length === 1 ? images[0] : images;
}

export const MAX_SCAN_SERVER_BYTES = 4_000_000;

export function scanUploadTooLarge(files: File[]): string | null {
  const oversized = files.find((f) => f.size > MAX_SCAN_SERVER_BYTES);
  if (!oversized) return null;
  return `File too large (${(oversized.size / 1_000_000).toFixed(1)}MB). Retake with fewer pages or less zoom.`;
}

export function readOcrTextFromForm(formData: FormData): string | null {
  const raw = formData.get("ocrText");
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed || null;
}

export interface VisionScanOptions {
  panoramic?: boolean;
  multiPage?: boolean;
}

export function visionScanHint(
  kind: string,
  options: VisionScanOptions & { pageCount?: number }
): string {
  const { panoramic, multiPage, pageCount = 1 } = options;
  if (multiPage && pageCount > 1) {
    return `This ${kind} spans ${pageCount} photos in order from top to bottom (first image = top). Read all images as one document. Merge details across pages and avoid duplicates at overlaps.`;
  }
  if (panoramic) {
    if (pageCount > 1) {
      return `This is a single stitched panoramic image of a long ${kind} built from ${pageCount} scanned pages (top to bottom). Read the entire tall image from top to bottom as one document.`;
    }
    return `This is a single panoramic photo of a long ${kind} — captured in one continuous vertical sweep. Read the entire tall image from top to bottom.`;
  }
  return `Analyze this ${kind} image.`;
}
