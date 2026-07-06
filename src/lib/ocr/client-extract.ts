"use client";

type Worker = import("tesseract.js").Worker;

let workerPromise: Promise<Worker> | null = null;

async function getOcrWorker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = (async () => {
      const { createWorker } = await import("tesseract.js");
      const worker = await createWorker("eng", 1, {
        logger: () => undefined,
      });
      return worker;
    })();
  }
  return workerPromise;
}

/** Run OCR in the browser — no API key required. */
export async function extractTextFromImageFile(file: File): Promise<string> {
  const worker = await getOcrWorker();
  const { data } = await worker.recognize(file);
  return data.text ?? "";
}

/** Attach recognized text to a scan upload when not already present. */
export async function appendClientOcrText(formData: FormData): Promise<string | null> {
  if (formData.get("ocrText")) {
    return String(formData.get("ocrText"));
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return null;
  }

  try {
    const text = (await extractTextFromImageFile(file)).trim();
    if (text) {
      formData.set("ocrText", text);
      return text;
    }
  } catch (err) {
    console.warn("Client OCR failed:", err);
  }

  return null;
}
