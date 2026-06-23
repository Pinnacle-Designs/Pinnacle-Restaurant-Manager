import type { NextConfig } from "next";

const dbUrl = process.env.DATABASE_URL ?? "";
const isPostgres =
  dbUrl.startsWith("postgresql://") || dbUrl.startsWith("postgres://");
const useSqlite =
  dbUrl.startsWith("file:") ||
  process.env.SEED_DEMO_DATA === "true" ||
  (process.env.VERCEL === "1" && !isPostgres);

const nextConfig: NextConfig = {
  ...(useSqlite
    ? { outputFileTracingIncludes: { "/*": ["./prisma/deploy.sqlite"] } }
    : {}),
  images: {
    remotePatterns: [],
    unoptimized: false,
    dangerouslyAllowSVG: true,
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
  },
};

export default nextConfig;
