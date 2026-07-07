/** Server-side invoice OCR preprocessing (Sharp when available). */

const OCR_TARGET_WIDTH = 2200;

export async function preprocessImageBufferForOcr(buffer: Buffer): Promise<Buffer> {
  return preprocessImageBufferVariant(buffer, { threshold: true });
}

export async function preprocessImageBufferSoftForOcr(buffer: Buffer): Promise<Buffer> {
  return preprocessImageBufferVariant(buffer, { threshold: false });
}

async function preprocessImageBufferVariant(
  buffer: Buffer,
  opts: { threshold: boolean }
): Promise<Buffer> {
  try {
    const sharp = (await import("sharp")).default;
    let pipeline = sharp(buffer)
      .rotate()
      .resize({ width: OCR_TARGET_WIDTH, withoutEnlargement: false })
      .grayscale()
      .normalize()
      .sharpen({ sigma: 0.8 });
    if (opts.threshold) {
      pipeline = pipeline.threshold(155);
    }
    return pipeline.png().toBuffer();
  } catch {
    return buffer;
  }
}
