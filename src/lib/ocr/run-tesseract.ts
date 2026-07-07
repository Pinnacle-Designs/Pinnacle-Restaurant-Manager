import type { Worker } from "tesseract.js";
import { scoreOcrText, type OcrTextKind } from "./ocr-text-score";

type TesseractPsm = "3" | "4" | "6" | "11";

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
    tessedit_char_whitelist:
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789$.,:/#-&'() ",
  } as Record<string, string>);
}

export async function recognizeWithBestPass(
  worker: Worker,
  input: Blob | Buffer | string,
  kind: OcrTextKind,
  onProgress?: (message: string) => void
): Promise<string> {
  let bestText = "";
  let bestScore = 0;

  for (const pass of OCR_PASSES) {
    onProgress?.(`OCR pass (${pass.label})…`);
    await configureTesseractForDocument(worker, pass.psm);
    const { data } = await worker.recognize(input as Parameters<Worker["recognize"]>[0]);
    const text = (data.text ?? "").trim();
    const score = scoreOcrText(text, kind);
    if (score > bestScore) {
      bestScore = score;
      bestText = text;
    }
    if (score >= 80 && text.length > 200) break;
  }

  return bestText;
}
