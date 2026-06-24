/** Parse a fetch Response body as JSON, with clear errors for empty or invalid payloads. */
export async function parseJsonResponse<T = Record<string, unknown>>(
  res: Response
): Promise<T> {
  const text = await res.text();
  if (!text.trim()) {
    if (!res.ok) {
      throw new Error(`Request failed (${res.status} ${res.statusText})`);
    }
    return {} as T;
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    if (res.status === 413 || /request entity too large/i.test(text)) {
      throw new Error(
        "Photo is too large to upload. Use multi-page mode with fewer pages, or retake at a lower zoom."
      );
    }
    throw new Error(
      res.ok
        ? "Invalid response from server"
        : `Request failed (${res.status}): server returned non-JSON`
    );
  }
}
