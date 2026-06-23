import { NextRequest, NextResponse } from "next/server";
import {
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "@simplewebauthn/server";
import { prisma } from "@/lib/prisma";
import { requireAnyPermission } from "@/lib/api-auth";
import { getWebAuthnOrigin, getWebAuthnRpId } from "@/lib/timeclock/webauthn-config";
import {
  consumeWebAuthnChallenge,
  setWebAuthnChallenge,
} from "@/lib/timeclock/webauthn-challenges";

export async function POST(request: NextRequest) {
  const { user, error } = await requireAnyPermission(request, ["clock_in"]);
  if (error) return error;

  const credentials = await prisma.webAuthnCredential.findMany({
    where: { userId: user!.id },
  });

  if (credentials.length === 0) {
    return NextResponse.json({ error: "No biometric credentials enrolled" }, { status: 404 });
  }

  const options = await generateAuthenticationOptions({
    rpID: getWebAuthnRpId(),
    userVerification: "required",
    allowCredentials: credentials.map((c) => ({
      id: c.credentialId,
      transports: ["internal", "hybrid"],
    })),
  });

  await setWebAuthnChallenge(user!.id, options.challenge);

  return NextResponse.json(options);
}

export async function PUT(request: NextRequest) {
  const { user, error } = await requireAnyPermission(request, ["clock_in"]);
  if (error) return error;

  const body = await request.json();
  const credentials = await prisma.webAuthnCredential.findMany({
    where: { userId: user!.id },
  });

  const credentialId = body.id as string | undefined;
  const stored = credentials.find((c) => c.credentialId === credentialId);
  if (!stored) {
    return NextResponse.json({ error: "Unknown biometric credential" }, { status: 400 });
  }

  const verification = await verifyAuthenticationResponse({
    response: body,
    expectedChallenge: async (challenge: string) =>
      consumeWebAuthnChallenge(user!.id, challenge),
    expectedOrigin: getWebAuthnOrigin(),
    expectedRPID: getWebAuthnRpId(),
    credential: {
      id: stored.credentialId,
      publicKey: Buffer.from(stored.publicKey, "base64url"),
      counter: stored.counter,
      transports: ["internal", "hybrid"],
    },
  });

  if (!verification.verified) {
    return NextResponse.json({ error: "Biometric verification failed" }, { status: 400 });
  }

  await prisma.webAuthnCredential.update({
    where: { id: stored.id },
    data: {
      counter: verification.authenticationInfo.newCounter,
      lastUsedAt: new Date(),
    },
  });

  return NextResponse.json({ verified: true });
}
