import { existsSync } from "fs";
import { join } from "path";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAiOcrConfigured, isDocumentOcrAvailable } from "@/lib/ocr/capabilities";
import { PRO_CLEAN_DEFAULT_EMAIL } from "@/lib/pro-clean-account";

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
  let proCleanAccount = false;
  let proCleanEmpty = false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    database = true;
    const proClean = await prisma.user.findUnique({
      where: { email: PRO_CLEAN_DEFAULT_EMAIL },
      select: {
        active: true,
        role: true,
        locationId: true,
        location: { select: { name: true } },
      },
    });
    proCleanAccount = Boolean(proClean?.active && proClean.role === "OWNER");
    if (proCleanAccount && proClean?.locationId) {
      const [menu, orders, staff] = await Promise.all([
        prisma.menuItem.count({ where: { locationId: proClean.locationId } }),
        prisma.order.count({ where: { locationId: proClean.locationId } }),
        prisma.staffMember.count({ where: { locationId: proClean.locationId } }),
      ]);
      proCleanEmpty =
        menu === 0 &&
        orders === 0 &&
        staff === 0 &&
        proClean.location?.name === "Clean Pro Restaurant";
    }
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
        proCleanAccount,
        proCleanEmpty,
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
