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

export async function configureTesseractForDocument(worker: Worker, psm: TesseractPsm): Promise<void> {
  await worker.setParameters({
    tessedit_pageseg_mode: psm,
    preserve_interword_spaces: "1",
    user_defined_dpi: "300",
  } as Record<string, string>);
}

export async function recognizeWithBestPass(
  worker: Worker,
  input: Blob | Buffer | string,
  kind: OcrTextKind,
  onProgress?: (message: string) => void
): Promise<string> {
  const candidates: string[] = [];

  for (const pass of OCR_PASSES) {
    onProgress?.(`OCR pass (${pass.label})…`);
    await configureTesseractForDocument(worker, pass.psm);
    const { data } = await worker.recognize(input as Parameters<Worker["recognize"]>[0]);
    const plain = (data.text ?? "").trim();
    if (plain) {
      candidates.push(plain);
      if (scoreOcrText(plain, kind) >= 82) break;
    }

    const structured = wordsToTabularText(tesseractWordsFromData(data.words));
    if (structured) {
      const plainScore = scoreOcrText(plain, kind);
      const structScore = scoreOcrText(structured, kind);
      if (structScore >= plainScore - 2) {
        candidates.push(structured);
        if (structScore >= 82) break;
      }
    }
  }

  return pickBestOcrTextPassage(kind, ...candidates);
}
