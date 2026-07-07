/** Reconstruct tab-separated rows from Tesseract word bounding boxes. */

export interface OcrWord {
  text: string;
  confidence: number;
  bbox: { x0: number; y0: number; x1: number; y1: number };
}

function wordCenterY(word: OcrWord): number {
  return (word.bbox.y0 + word.bbox.y1) / 2;
}

function wordHeight(word: OcrWord): number {
  return Math.max(1, word.bbox.y1 - word.bbox.y0);
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** Group words into rows and insert tabs between column gaps. */
export function wordsToTabularText(words: OcrWord[], minConfidence = 30): string {
  const filtered = words
    .map((w) => ({
      ...w,
      text: w.text.replace(/\s+/g, " ").trim(),
    }))
    .filter((w) => w.text.length > 0 && w.confidence >= minConfidence);

  if (filtered.length === 0) return "";

  const rowTolerance = Math.max(8, median(filtered.map(wordHeight)) * 0.6);
  const sorted = [...filtered].sort((a, b) => wordCenterY(a) - wordCenterY(b) || a.bbox.x0 - b.bbox.x0);

  const rows: OcrWord[][] = [];
  for (const word of sorted) {
    const y = wordCenterY(word);
    let row = rows.find((r) => Math.abs(wordCenterY(r[0]!) - y) <= rowTolerance);
    if (!row) {
      row = [];
      rows.push(row);
    }
    row.push(word);
  }

  const lines: string[] = [];
  for (const row of rows) {
    row.sort((a, b) => a.bbox.x0 - b.bbox.x0);
    const gaps: number[] = [];
    for (let i = 1; i < row.length; i += 1) {
      gaps.push(row[i]!.bbox.x0 - row[i - 1]!.bbox.x1);
    }
    const gapThreshold = Math.max(18, median(gaps.filter((g) => g > 2)) * 1.4 || 24);

    let line = row[0]!.text;
    for (let i = 1; i < row.length; i += 1) {
      const gap = row[i]!.bbox.x0 - row[i - 1]!.bbox.x1;
      line += gap >= gapThreshold ? `\t${row[i]!.text}` : ` ${row[i]!.text}`;
    }
    lines.push(line);
  }

  return lines.join("\n");
}

export function tesseractWordsFromData(
  words: Array<{
    text?: string;
    confidence?: number;
    bbox?: { x0?: number; y0?: number; x1?: number; y1?: number };
  }> | null | undefined
): OcrWord[] {
  if (!words?.length) return [];
  return words
    .filter((w) => w.text?.trim())
    .map((w) => ({
      text: w.text!.trim(),
      confidence: w.confidence ?? 0,
      bbox: {
        x0: w.bbox?.x0 ?? 0,
        y0: w.bbox?.y0 ?? 0,
        x1: w.bbox?.x1 ?? 0,
        y1: w.bbox?.y1 ?? 0,
      },
    }));
}
