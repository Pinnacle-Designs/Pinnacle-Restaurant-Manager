import { NextResponse } from "next/server";

/** Deployment fingerprint — changes on every Vercel deploy. */
export async function GET() {
  const version =
    process.env.VERCEL_DEPLOYMENT_ID?.trim() ||
    process.env.VERCEL_GIT_COMMIT_SHA?.trim() ||
    process.env.npm_package_version?.trim() ||
    "development";

  return NextResponse.json(
    { version },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    }
  );
}
