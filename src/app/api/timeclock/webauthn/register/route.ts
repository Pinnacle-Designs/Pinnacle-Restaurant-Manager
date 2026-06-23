import { NextRequest, NextResponse } from "next/server";
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
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

  const existing = await prisma.webAuthnCredential.findMany({
    where: { userId: user!.id },
    select: { credentialId: true },
  });

  const options = await generateRegistrationOptions({
    rpName: "Pinnacle Restaurant Manager",
    rpID: getWebAuthnRpId(),
    userName: user!.email,
    userDisplayName: user!.name,
    userID: new TextEncoder().encode(user!.id),
    attestationType: "none",
    excludeCredentials: existing.map((c) => ({
      id: c.credentialId,
      transports: ["internal", "hybrid"],
    })),
    authenticatorSelection: {
      authenticatorAttachment: "platform",
      userVerification: "required",
      residentKey: "preferred",
    },
  });

  await setWebAuthnChallenge(user!.id, options.challenge);

  return NextResponse.json(options);
}

export async function PUT(request: NextRequest) {
  const { user, error } = await requireAnyPermission(request, ["clock_in"]);
  if (error) return error;

  const body = await request.json();
  const verification = await verifyRegistrationResponse({
    response: body,
    expectedChallenge: async (challenge: string) =>
      consumeWebAuthnChallenge(user!.id, challenge),
    expectedOrigin: getWebAuthnOrigin(),
    expectedRPID: getWebAuthnRpId(),
  });

  if (!verification.verified || !verification.registrationInfo) {
    return NextResponse.json({ error: "Biometric enrollment failed" }, { status: 400 });
  }

  const { credential, credentialDeviceType } = verification.registrationInfo;
  const credentialId =
    typeof credential.id === "string"
      ? credential.id
      : Buffer.from(credential.id).toString("base64url");
  const publicKey =
    typeof credential.publicKey === "string"
      ? credential.publicKey
      : Buffer.from(credential.publicKey).toString("base64url");

  await prisma.webAuthnCredential.upsert({
    where: { credentialId },
    create: {
      userId: user!.id,
      credentialId,
      publicKey,
      counter: credential.counter,
      deviceLabel: credentialDeviceType === "singleDevice" ? "This device" : "Biometric key",
    },
    update: {
      publicKey,
      counter: credential.counter,
      lastUsedAt: new Date(),
    },
  });

  return NextResponse.json({ success: true });
}
