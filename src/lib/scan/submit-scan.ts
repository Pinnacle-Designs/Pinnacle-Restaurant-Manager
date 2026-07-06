import { clientFetch } from "@/lib/embed-api-client";
import { parseJsonResponse } from "@/lib/fetch-json";
import { MAX_UPLOAD_BYTES } from "@/lib/receipt/panorama-stitch";

function validateScanFormData(formData: FormData): void {
  const file = formData.get("file");
  if (file instanceof File && file.size > MAX_UPLOAD_BYTES) {
    throw new Error(
      `Photo is too large to upload (${(file.size / 1_000_000).toFixed(1)}MB). Use fewer pages or retake at a lower zoom.`
    );
  }
}

/** POST/PUT multipart scan uploads with consistent JSON error handling. */
export async function submitScanForm<T = Record<string, unknown>>(
  url: string,
  formData: FormData,
  method: "POST" | "PUT" = "POST",
  options?: { runLocalOcr?: boolean; onOcrProgress?: (message: string) => void }
): Promise<T> {
  validateScanFormData(formData);
  if (method === "POST" && options?.runLocalOcr !== false) {
    const { appendClientOcrText } = await import("@/lib/ocr/client-extract");
    await appendClientOcrText(formData, options?.onOcrProgress);
  }
  const res = await clientFetch(url, { method, body: formData });
  const data = await parseJsonResponse<T & { error?: string }>(res);
  if (!res.ok) {
    throw new Error(data.error || "Scan failed");
  }
  return data;
}
