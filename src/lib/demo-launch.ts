export type DemoMode = "seeded" | "fresh";

export async function ensureDemoUsers() {
  const res = await fetch("/api/auth/seed", { method: "POST" });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Could not initialize demo accounts");
  }
}

export async function launchDemo(
  email = "owner@pinnacle.com",
  password = "demo1234",
  demoMode: DemoMode = "seeded",
  options?: { embed?: boolean }
) {
  await ensureDemoUsers();
  const res = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      email,
      password,
      demo: true,
      demoMode,
      embed: options?.embed === true,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Demo login failed");
  if (data.workspaceError) throw new Error(data.workspaceError);
  return data;
}
