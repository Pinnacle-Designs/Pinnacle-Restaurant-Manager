/** Shared production environment helpers and startup validation. */

export function isProductionRuntime(): boolean {
  return process.env.NODE_ENV === "production";
}

export function getAuthSecret(): string {
  const secret = process.env.AUTH_SECRET?.trim();
  if (secret) {
    if (isProductionRuntime() && secret.length < 32) {
      throw new Error("AUTH_SECRET must be at least 32 characters in production");
    }
    return secret;
  }
  if (isProductionRuntime()) {
    throw new Error("AUTH_SECRET must be set in production");
  }
  return "pinnacle-dev-secret-change-me";
}

export function getAppBaseUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");
  if (isProductionRuntime()) {
    throw new Error("NEXT_PUBLIC_APP_URL must be set in production");
  }
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

export function isPostgresDatabase(): boolean {
  const url = process.env.DATABASE_URL?.trim() ?? "";
  return url.startsWith("postgresql://") || url.startsWith("postgres://");
}

export function isSqliteDatabase(): boolean {
  const url = process.env.DATABASE_URL?.trim() ?? "";
  return url.startsWith("file:");
}

/** Fail fast on misconfiguration before serving production traffic. */
export function validateProductionEnv(): void {
  if (!isProductionRuntime()) return;

  const errors: string[] = [];

  try {
    getAuthSecret();
  } catch (err) {
    errors.push(err instanceof Error ? err.message : "Invalid AUTH_SECRET");
  }

  if (!process.env.DATABASE_URL?.trim()) {
    errors.push("DATABASE_URL must be set in production");
  } else if (isSqliteDatabase() && process.env.ALLOW_SQLITE_PRODUCTION !== "true") {
    errors.push(
      "DATABASE_URL uses SQLite — use PostgreSQL in production (set ALLOW_SQLITE_PRODUCTION=true only for previews)"
    );
  }

  try {
    getAppBaseUrl();
  } catch (err) {
    errors.push(err instanceof Error ? err.message : "Invalid NEXT_PUBLIC_APP_URL");
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY?.trim();
  if (stripeKey && process.env.PLAN_BILLING_OPTIONAL !== "true") {
    if (!process.env.STRIPE_WEBHOOK_SECRET?.trim()) {
      errors.push("STRIPE_WEBHOOK_SECRET is required when STRIPE_SECRET_KEY is set");
    }
    for (const plan of ["STRIPE_PRICE_STARTER", "STRIPE_PRICE_GROWTH", "STRIPE_PRICE_PRO"] as const) {
      if (!process.env[plan]?.trim()) {
        errors.push(`${plan} is required for production Stripe billing`);
      }
    }
  }

  if (errors.length > 0) {
    throw new Error(`Production environment misconfigured:\n- ${errors.join("\n- ")}`);
  }
}
