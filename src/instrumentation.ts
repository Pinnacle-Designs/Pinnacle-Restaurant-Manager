export async function register() {
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
