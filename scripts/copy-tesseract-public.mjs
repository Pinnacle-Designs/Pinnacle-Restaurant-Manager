/**
 * Copy Tesseract browser assets into public/tesseract so every user loads OCR
 * from the same origin (no third-party CDN required in production).
 */
import { cpSync, mkdirSync, existsSync } from "fs";
import { join } from "path";

const root = process.cwd();
const outDir = join(root, "public", "tesseract");
const langDir = join(outDir, "lang");

const copies = [
  {
    from: join(root, "node_modules", "tesseract.js", "dist", "worker.min.js"),
    to: join(outDir, "worker.min.js"),
  },
  {
    from: join(
      root,
      "node_modules",
      "tesseract.js-core",
      "tesseract-core-simd-lstm.wasm.js"
    ),
    to: join(outDir, "tesseract-core-simd-lstm.wasm.js"),
  },
  {
    from: join(
      root,
      "node_modules",
      "tesseract.js-core",
      "tesseract-core-simd-lstm.wasm"
    ),
    to: join(outDir, "tesseract-core-simd-lstm.wasm"),
  },
  {
    from: join(
      root,
      "node_modules",
      "@tesseract.js-data",
      "eng",
      "4.0.0_best_int",
      "eng.traineddata.gz"
    ),
    to: join(langDir, "eng.traineddata.gz"),
  },
];

function main() {
  mkdirSync(langDir, { recursive: true });

  for (const { from, to } of copies) {
    if (!existsSync(from)) {
      console.warn(`[tesseract] skip missing: ${from}`);
      continue;
    }
    cpSync(from, to);
  }

  console.log("[tesseract] OCR assets copied to public/tesseract");
}

main();
