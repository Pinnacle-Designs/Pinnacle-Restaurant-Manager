import type { NextConfig } from "next";

const useSqlite = (process.env.DATABASE_URL ?? "").startsWith("file:");

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
