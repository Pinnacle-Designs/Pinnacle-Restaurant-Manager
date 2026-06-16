"use client";

export async function enrollBiometric(): Promise<void> {
  const { startRegistration } = await import("@simplewebauthn/browser");

  const optionsRes = await fetch("/api/timeclock/webauthn/register", { method: "POST" });
  const options = await optionsRes.json();
  if (!optionsRes.ok) throw new Error(options.error || "Could not start biometric enrollment");

  const attestation = await startRegistration({ optionsJSON: options });
  const verifyRes = await fetch("/api/timeclock/webauthn/register", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(attestation),
  });
  const verifyData = await verifyRes.json();
  if (!verifyRes.ok) throw new Error(verifyData.error || "Biometric enrollment failed");
}

export async function verifyBiometric(): Promise<boolean> {
  const { startAuthentication } = await import("@simplewebauthn/browser");

  const optionsRes = await fetch("/api/timeclock/webauthn/authenticate", { method: "POST" });
  const options = await optionsRes.json();
  if (!optionsRes.ok) throw new Error(options.error || "Biometric verification unavailable");

  const assertion = await startAuthentication({ optionsJSON: options });
  const verifyRes = await fetch("/api/timeclock/webauthn/authenticate", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(assertion),
  });
  const verifyData = await verifyRes.json();
  if (!verifyRes.ok) throw new Error(verifyData.error || "Biometric verification failed");
  return Boolean(verifyData.verified);
}

export async function isBiometricEnrolled(): Promise<boolean> {
  const res = await fetch("/api/timeclock/webauthn");
  if (!res.ok) return false;
  const data = await res.json();
  return Boolean(data.enrolled);
}
