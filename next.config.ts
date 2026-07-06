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
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      {
        source: "/manifest.json",
        headers: [{ key: "Cache-Control", value: "no-cache" }],
      },
    ];
  },
  images: {
    remotePatterns: [],
    unoptimized: false,
    dangerouslyAllowSVG: true,
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
  },
};

export default nextConfig;
