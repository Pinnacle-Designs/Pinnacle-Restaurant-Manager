import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseOAuthState } from "@/lib/payments/oauth-state";
import { exchangeSquareOAuthCode } from "@/lib/payments/square-server";
import { appBaseUrl } from "@/lib/payments/providers";
import { encryptCredential } from "@/lib/credential-crypto";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const errorParam = searchParams.get("error");
  const base = `${appBaseUrl()}/account?tab=billing`;

  if (errorParam) {
    return NextResponse.redirect(`${base}&pos=square-denied`);
  }
  if (!code || !state) {
    return NextResponse.redirect(`${base}&pos=square-error`);
  }

  const parsed = parseOAuthState<{ locationId: string; userId: string; flow: string }>(state);
  if (!parsed || parsed.flow !== "square-pos") {
    return NextResponse.redirect(`${base}&pos=square-error`);
  }

  try {
    const token = await exchangeSquareOAuthCode(code);
    if (!token.merchant_id) {
      return NextResponse.redirect(`${base}&pos=square-error`);
    }

    const encryptedRefresh = encryptCredential(token.refresh_token ?? null);

    await prisma.paymentProviderConnection.upsert({
      where: {
        locationId_purpose: { locationId: parsed.locationId, purpose: "POS" },
      },
      create: {
        locationId: parsed.locationId,
        provider: "SQUARE",
        purpose: "POS",
        accountId: token.merchant_id,
        credential: encryptedRefresh,
        status: "connected",
      },
      update: {
        provider: "SQUARE",
        accountId: token.merchant_id,
        credential: encryptedRefresh,
        status: "connected",
      },
    });

    return NextResponse.redirect(`${base}&pos=square-connected`);
  } catch (err) {
    console.error("Square callback error:", err);
    return NextResponse.redirect(`${base}&pos=square-error`);
  }
}
