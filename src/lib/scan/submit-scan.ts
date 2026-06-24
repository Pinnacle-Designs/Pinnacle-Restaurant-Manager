import { clientFetch } from "@/lib/embed-api-client";
import { parseJsonResponse } from "@/lib/fetch-json";

/** POST/PUT multipart scan uploads with consistent JSON error handling. */
export async function submitScanForm<T = Record<string, unknown>>(
  url: string,
  formData: FormData,
  method: "POST" | "PUT" = "POST"
): Promise<T> {
  const res = await clientFetch(url, { method, body: formData });
  const data = await parseJsonResponse<T & { error?: string }>(res);
  if (!res.ok) {
    throw new Error(data.error || "Scan failed");
  }
  return data;
}
