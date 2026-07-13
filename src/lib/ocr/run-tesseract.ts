import type { Worker } from "tesseract.js";
import { pickBestOcrTextPassage, scoreOcrText, type OcrTextKind } from "./ocr-text-score";
import { tesseractWordsFromData, wordsToTabularText } from "./tesseract-structured";

type TesseractPsm = "3" | "6" | "4" | "11";

const OCR_PASSES: Array<{ psm: TesseractPsm; label: string }> = [
  { psm: "6", label: "block layout" },
  { psm: "4", label: "single column" },
  { psm: "11", label: "sparse text" },
  { psm: "3", label: "auto layout" },
];

function earlyExitScore(kind: OcrTextKind): number {
  return kind === "invoice" ? 95 : 82;
}

export async function configureTesseractForDocument(worker: Worker, psm: TesseractPsm): Promise<void> {
  await worker.setParameters({
    tessedit_pageseg_mode: psm,
    preserve_interword_spaces: "1",
    user_defined_dpi: "300",
  } as Record<string, string>);
}

/** Run all PSM passes and return unique passages sorted by quality (best first). */
export async function recognizeAllPasses(
  worker: Worker,
  input: Blob | Buffer | string,
  kind: OcrTextKind,
  onProgress?: (message: string) => void
): Promise<string[]> {
  const scored: Array<{ text: string; score: number }> = [];
  const seen = new Set<string>();

  const addCandidate = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || seen.has(trimmed)) return;
    seen.add(trimmed);
    scored.push({ text: trimmed, score: scoreOcrText(trimmed, kind) });
  };

  for (const pass of OCR_PASSES) {
    onProgress?.(`OCR pass (${pass.label})…`);
    await configureTesseractForDocument(worker, pass.psm);
    const { data } = await worker.recognize(input as Parameters<Worker["recognize"]>[0]);
    const plain = (data.text ?? "").trim();
    if (plain) {
      addCandidate(plain);
      if (scoreOcrText(plain, kind) >= earlyExitScore(kind)) break;
    }

    const structured = wordsToTabularText(tesseractWordsFromData(data.words));
    if (structured) {
      addCandidate(structured);
      if (scoreOcrText(structured, kind) >= earlyExitScore(kind)) break;
    }
  }

  return scored
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.text);
}

export async function recognizeWithBestPass(
  worker: Worker,
  input: Blob | Buffer | string,
  kind: OcrTextKind,
  onProgress?: (message: string) => void
): Promise<string> {
  const candidates = await recognizeAllPasses(worker, input, kind, onProgress);
  return pickBestOcrTextPassage(kind, ...candidates);
}
