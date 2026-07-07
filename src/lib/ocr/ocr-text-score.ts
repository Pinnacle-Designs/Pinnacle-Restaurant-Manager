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
    score += [...normalized.matchAll(/\b[A-Z]{2,6}\d{2,4}\b/g)].length * 5;
    score += [...normalized.matchAll(/\b(?:case|cas|cs|lb|lbs|each|ea)\b/gi)].length * 2;
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

export function mergeOcrTextPassages(...passages: Array<string | null | undefined>): string {
  const parts = passages.map((p) => p?.trim()).filter(Boolean) as string[];
  if (!parts.length) return "";
  if (parts.length === 1) return parts[0]!;

  const seen = new Set<string>();
  const lines: string[] = [];
  for (const part of parts) {
    for (const line of part.split(/\r?\n/)) {
      const key = line.trim().toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      lines.push(line.trim());
    }
  }
  return lines.join("\n");
}
