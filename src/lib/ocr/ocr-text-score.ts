/** Score raw OCR text quality to pick the best recognition pass. */

export type OcrTextKind = "invoice" | "receipt" | "generic";

export function scoreOcrText(text: string, kind: OcrTextKind = "generic"): number {
  const normalized = text.trim();
  if (!normalized) return 0;

  let score = Math.min(normalized.length / 8, 60);
  const lines = normalized.split(/\r?\n/).filter((l) => l.trim().length > 1);
  score += Math.min(lines.length * 2, 50);

  const moneyMatches = [...normalized.matchAll(/(?:^|\s|\$)([\d,]+\.\d{2})(?:\s|$)/gm)];
  score += Math.min(moneyMatches.length * 2, 40);

  const alphaRatio =
    (normalized.match(/[A-Za-z]/g)?.length ?? 0) / Math.max(normalized.length, 1);
  if (alphaRatio > 0.25) score += 10;

  if (kind === "invoice") {
    if (/\binvoice\b/i.test(normalized)) score += 8;
    if (/\btotal\b/i.test(normalized)) score += 6;
    if (/\bbill\s+to\b/i.test(normalized)) score += 4;
    if (/\bqty\s*ordered\b/i.test(normalized) && /\bextended\b/i.test(normalized)) score += 12;
    if (/\t/.test(normalized)) score += Math.min(normalized.split("\t").length, 30);
    score += [...normalized.matchAll(/\b[A-Z]{2,6}\d{2,4}\b/g)].length * 5;
    score += [...normalized.matchAll(/\b(?:case|cas|cs|lb|lbs|each|ea)\b/gi)].length * 2;
    score += lines.filter((l) => /\b[A-Z]{2,6}\d{2,4}\b/.test(l) && /[\d,]+\.\d{2}/.test(l)).length * 8;
    const lineSum = [...normalized.matchAll(/(?:^|\s)([\d,]+\.\d{2})(?:\s|$)/gm)]
      .map((m) => parseFloat(m[1]!.replace(/,/g, "")))
      .reduce((s, n) => s + n, 0);
    if (lineSum > 100 && lineSum < 500_000) score += 6;
  }

  if (kind === "receipt") {
    if (/\b(?:subtotal|total|tax|change)\b/i.test(normalized)) score += 10;
    if (/\b(?:visa|mastercard|debit|cash)\b/i.test(normalized)) score += 4;
  }

  return score;
}

export function isWeakOcrText(text: string, kind: OcrTextKind = "generic"): boolean {
  const trimmed = text.trim();
  if (trimmed.length < 40) return true;
  return scoreOcrText(trimmed, kind) < 25;
}

export function pickBestOcrTextPassage(
  kind: OcrTextKind,
  ...passages: Array<string | null | undefined>
): string {
  let best = "";
  let bestScore = 0;
  for (const passage of passages) {
    const trimmed = passage?.trim();
    if (!trimmed) continue;
    const score = scoreOcrText(trimmed, kind);
    if (score > bestScore) {
      bestScore = score;
      best = trimmed;
    }
  }
  return best;
}

/** @deprecated Prefer pickBestOcrTextPassage — merging pollutes line order. */
export function mergeOcrTextPassages(...passages: Array<string | null | undefined>): string {
  return pickBestOcrTextPassage("generic", ...passages);
}
