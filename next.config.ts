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
    : {
        outputFileTracingIncludes: {
          "/api/purchasing/invoices/scan": [
            "./node_modules/tesseract.js/**",
            "./node_modules/tesseract.js-core/**",
          ],
          "/api/receipts/scan": [
            "./node_modules/tesseract.js/**",
            "./node_modules/tesseract.js-core/**",
          ],
        },
      }),
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
      {
        source: "/tesseract/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
          { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
        ],
      },
      {
        source: "/tesseract/:path*.wasm",
        headers: [{ key: "Content-Type", value: "application/wasm" }],
      },
    ];
  },
  images: {
    remotePatterns: [],
    unoptimized: false,
    dangerouslyAllowSVG: true,
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
  },
  serverExternalPackages: ["tesseract.js", "tesseract.js-core"],
};

export default nextConfig;
