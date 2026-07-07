import { NextRequest, NextResponse } from "next/server";
import { ensureProCleanAccount } from "@/lib/pro-clean-account";

export const runtime = "nodejs";
export const maxDuration = 60;

/** One-time / maintenance: create pro-clean account on the live database. */
export async function POST(request: NextRequest) {
  const authSecret = process.env.AUTH_SECRET?.trim();
  const setupKey = request.headers.get("x-setup-key")?.trim();

  if (!authSecret || !setupKey || setupKey !== authSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const resetPassword = body.reset === true || process.env.PRO_CLEAN_RESET === "true";

    const result = await ensureProCleanAccount({
      email: typeof body.email === "string" ? body.email : undefined,
      password: typeof body.password === "string" ? body.password : undefined,
      resetPassword,
    });

    return NextResponse.json({
      ok: true,
      ...result,
      loginUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin}/login/pro`,
    });
  } catch (err) {
    console.error("[setup/pro-account]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Setup failed" },
      { status: 500 }
    );
  }
}
