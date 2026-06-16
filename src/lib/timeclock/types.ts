export type PunchVerificationMode = "PHOTO" | "BIOMETRIC" | "PHOTO_OR_BIOMETRIC";

export const PUNCH_VERIFICATION_MODES: PunchVerificationMode[] = [
  "PHOTO",
  "BIOMETRIC",
  "PHOTO_OR_BIOMETRIC",
];

export function punchVerificationLabel(mode: string): string {
  switch (mode) {
    case "BIOMETRIC":
      return "Biometric only";
    case "PHOTO_OR_BIOMETRIC":
      return "Photo or biometric";
    default:
      return "Photo required";
  }
}
