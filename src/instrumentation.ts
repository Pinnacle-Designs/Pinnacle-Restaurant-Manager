export async function register() {
  // Edge middleware bundles always use NODE_ENV=production, even during `next dev`.
  // Production env checks belong on the Node.js server only.
  if (process.env.NEXT_RUNTIME === "edge") {
    return;
  }

  const { validateProductionEnv } = await import("@/lib/env");
  try {
    validateProductionEnv();
  } catch (err) {
    if (process.env.SEED_DEMO_DATA === "true") {
      console.warn(
        "[instrumentation] Demo deploy env warning:",
        err instanceof Error ? err.message : err
      );
      return;
    }
    throw err;
  }
}
