/** Server-side invoice OCR preprocessing (Sharp when available). */

export const OCR_TARGET_WIDTH = 2800;

export async function preprocessImageBufferForOcr(buffer: Buffer): Promise<Buffer> {
  return preprocessImageBufferVariant(buffer, { threshold: true, thresholdLevel: 155 });
}

export async function preprocessImageBufferSoftForOcr(buffer: Buffer): Promise<Buffer> {
  return preprocessImageBufferVariant(buffer, { threshold: false });
}

/** Local adaptive contrast — helps faded thermal / photocopied invoices. */
export async function preprocessImageBufferAdaptiveForOcr(buffer: Buffer): Promise<Buffer> {
  return preprocessImageBufferVariant(buffer, { threshold: true, thresholdLevel: 128, clahe: true });
}

async function preprocessImageBufferVariant(
  buffer: Buffer,
  opts: { threshold: boolean; thresholdLevel?: number; clahe?: boolean }
): Promise<Buffer> {
  try {
    const sharp = (await import("sharp")).default;
    let pipeline = sharp(buffer)
      .rotate()
      .resize({ width: OCR_TARGET_WIDTH, withoutEnlargement: false })
      .grayscale()
      .normalize()
      .sharpen({ sigma: 1.1, m1: 0.5, m2: 2 });

    if (opts.clahe) {
      pipeline = pipeline.linear(1.15, -12).gamma(1.05);
    }

    if (opts.threshold) {
      pipeline = pipeline.threshold(opts.thresholdLevel ?? 155);
    }

    return pipeline.png().toBuffer();
  } catch {
    return buffer;
  }
}
