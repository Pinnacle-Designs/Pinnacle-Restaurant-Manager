import { DEMO_TOUR_STOPS } from "@/lib/marketing-content";

/** Demo tour routes that may be loaded via `/embed?path=…` */
export const EMBEDDABLE_DEMO_PATHS = DEMO_TOUR_STOPS.map((stop) => stop.path);

const EMBEDDABLE_DEMO_PATH_SET = new Set<string>(EMBEDDABLE_DEMO_PATHS);

export type EmbedChrome = "mobile" | "full";

export function resolveEmbedChrome(raw: string | null | undefined): EmbedChrome {
  return raw === "full" ? "full" : "mobile";
}

export function embedQueryValue(chrome: EmbedChrome): string {
  return chrome === "full" ? "full" : "mobile";
}

export function isEmbeddableEmbedParam(embedParam: string | null): boolean {
  return embedParam === "1" || embedParam === "mobile" || embedParam === "full";
}

export function resolveEmbedPath(raw: string | null | undefined): string {
  const path = raw?.trim() || DEMO_TOUR_STOPS[0].path;
  return EMBEDDABLE_DEMO_PATH_SET.has(path) ? path : DEMO_TOUR_STOPS[0].path;
}

/** Server-side launch — seeds demo, sets session cookie, redirects to app route. */
export function embedLaunchUrl(targetPath?: string, chrome: EmbedChrome = "mobile"): string {
  const path = resolveEmbedPath(targetPath ?? DEMO_TOUR_STOPS[0].path);
  return `/api/embed/launch?path=${encodeURIComponent(path)}&chrome=${chrome}`;
}

/** @deprecated Prefer embedLaunchUrl — kept for /embed page fallback */
export function embedBootstrapUrl(targetPath?: string): string {
  const path = resolveEmbedPath(targetPath ?? DEMO_TOUR_STOPS[0].path);
  return `/embed?path=${encodeURIComponent(path)}`;
}

/** True when this page runs inside an iframe on a different origin (needs SameSite=None cookies). */
export function needsCrossOriginEmbedCookies(): boolean {
  if (typeof window === "undefined" || window.self === window.top) return false;
  try {
    return window.parent.location.origin !== window.location.origin;
  } catch {
    // Parent is cross-origin if we cannot read its location.
    return true;
  }
}

/** CSP `frame-ancestors` value for embeddable responses (`'self'` + optional env origins). */
export function getEmbedFrameAncestors(request?: { nextUrl: URL }): string {
  if (process.env.NODE_ENV === "development") {
    return "*";
  }

  const host = request?.nextUrl.hostname;
  if (host === "localhost" || host === "127.0.0.1") {
    return "*";
  }

  const parts = ["'self'"];
  for (const origin of getMarketingFrameAncestors()) {
    if (!parts.includes(origin)) parts.push(origin);
  }
  return parts.join(" ");
}

/** Local ports used when previewing docs/ via Live Server or another static server. */
const LOCAL_DOCS_PORTS = [3000, 3001, 3002, 3003, 3004, 3005, 5173, 5500, 8080];

/** Origins allowed to iframe the app (GitHub Pages marketing site, etc.). */
export function getMarketingFrameAncestors(): string[] {
  const origins: string[] = [];
  const extra = process.env.EMBED_FRAME_ANCESTORS?.trim();
  if (extra) {
    for (const origin of extra.split(/[\s,]+/)) {
      if (origin) origins.push(origin);
    }
  }
  const githubPages = process.env.GITHUB_PAGES_ORIGIN?.trim();
  if (githubPages) origins.push(githubPages);

  // GitHub Pages — Pinnacle-Designs org project site + any *.github.io host
  origins.push("https://pinnacle-designs.github.io");
  origins.push("https://*.github.io");

  // Vercel production + preview deployments (docs at /docs on same project)
  const vercelUrl = process.env.VERCEL_URL?.trim();
  if (vercelUrl) origins.push(`https://${vercelUrl}`);
  const publicAppUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (publicAppUrl) origins.push(publicAppUrl.replace(/\/$/, ""));

  // Live Server / static preview of docs/ against production app
  for (const port of LOCAL_DOCS_PORTS) {
    origins.push(`http://localhost:${port}`);
    origins.push(`http://127.0.0.1:${port}`);
  }

  return origins;
}

export function isEmbeddableRequest(pathname: string, embedParam: string | null): boolean {
  return (
    pathname === "/embed" ||
    pathname === "/api/embed/launch" ||
    isEmbeddableEmbedParam(embedParam)
  );
}
