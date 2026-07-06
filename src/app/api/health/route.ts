import { existsSync } from "fs";
import { join } from "path";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAiOcrConfigured, isDocumentOcrAvailable } from "@/lib/ocr/capabilities";

export const runtime = "nodejs";

function tesseractAssetsReady(): boolean {
  const base = join(process.cwd(), "public", "tesseract");
  return (
    existsSync(join(base, "worker.min.js")) &&
    existsSync(join(base, "tesseract-core-simd-lstm.wasm.js")) &&
    existsSync(join(base, "lang", "eng.traineddata.gz"))
  );
}

/** Lightweight readiness probe for deploys and uptime checks. */
export async function GET() {
  const version =
    process.env.VERCEL_DEPLOYMENT_ID?.trim() ||
    process.env.VERCEL_GIT_COMMIT_SHA?.trim() ||
    process.env.npm_package_version?.trim() ||
    "development";

  let database = false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    database = true;
  } catch {
    database = false;
  }

  const ocrAssets = tesseractAssetsReady();
  const ok = database && ocrAssets;

  return NextResponse.json(
    {
      ok,
      version,
      checks: {
        database,
        documentOcr: isDocumentOcrAvailable(),
        ocrAssets,
        aiOcr: isAiOcrConfigured(),
      },
    },
    {
      status: ok ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    }
  );
}
