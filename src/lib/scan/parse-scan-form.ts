import type { DocumentScanMode } from "@/components/scan/DocumentScanModeToggle";

export interface ParsedScanForm {
  files: File[];
  scanMode: DocumentScanMode;
  panoramic: boolean;
  pageCount: number;
}

export function parseScanFormData(formData: FormData): ParsedScanForm {
  const multiFiles = formData
    .getAll("files")
    .filter((f): f is File => f instanceof File && f.size > 0);
  const singleFile = formData.get("file");
  const file = singleFile instanceof File && singleFile.size > 0 ? singleFile : null;
  const files = multiFiles.length > 0 ? multiFiles : file ? [file] : [];

  const scanMode = (formData.get("scanMode") as DocumentScanMode) || "single";
  const panoramic =
    formData.get("panoramic") === "true" ||
    scanMode === "panorama" ||
    files.length > 1;

  return {
    files,
    scanMode,
    panoramic,
    pageCount: files.length,
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

export function base64Input(
  images: string[]
): string | string[] {
  return images.length === 1 ? images[0] : images;
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
    return `This is a single panoramic photo of a long ${kind} — captured in one continuous vertical sweep. Read the entire tall image from top to bottom.`;
  }
  return `Analyze this ${kind} image.`;
}
