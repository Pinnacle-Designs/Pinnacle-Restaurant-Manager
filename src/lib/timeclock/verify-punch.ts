import type { PunchVerificationMode } from "./types";

export type PunchIdentityInput = {
  photoDataUrl?: string | null;
  biometricVerified?: boolean;
};

export function verifyPunchIdentity(
  location: {
    punchPhotoRequired: boolean;
    punchVerificationMode: string;
  },
  input: PunchIdentityInput
): {
  ok: boolean;
  verified: boolean;
  method?: "PHOTO" | "BIOMETRIC";
  error?: string;
} {
  const mode = (location.punchVerificationMode || "PHOTO") as PunchVerificationMode;

  if (!location.punchPhotoRequired) {
    return { ok: true, verified: false };
  }

  if (input.biometricVerified) {
    if (mode === "PHOTO") {
      return {
        ok: false,
        verified: false,
        error: "This location requires a photo at punch — biometric alone is not enabled.",
      };
    }
    return { ok: true, verified: true, method: "BIOMETRIC" };
  }

  if (input.photoDataUrl?.trim()) {
    return { ok: true, verified: true, method: "PHOTO" };
  }

  if (process.env.NODE_ENV === "development") {
    return { ok: true, verified: false };
  }

  if (mode === "BIOMETRIC") {
    return {
      ok: false,
      verified: false,
      error: "Use Touch ID, Face ID, or Windows Hello to verify your identity before punching.",
    };
  }

  if (mode === "PHOTO_OR_BIOMETRIC") {
    return {
      ok: false,
      verified: false,
      error: "Identity verification required — use device biometrics or take a punch photo.",
    };
  }

  return {
    ok: false,
    verified: false,
    error: "A punch photo is required. Position your face in the camera and clock in.",
  };
}
