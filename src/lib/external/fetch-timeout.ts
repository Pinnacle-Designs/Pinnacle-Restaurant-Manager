const DEFAULT_MS = 8_000;

/** Fetch with a hard timeout so external APIs cannot hang page loads. */
export async function fetchWithTimeout(
  url: string,
  init?: RequestInit,
  timeoutMs = DEFAULT_MS
): Promise<Response> {
  return fetch(url, {
    ...init,
    signal: init?.signal ?? AbortSignal.timeout(timeoutMs),
  });
}
