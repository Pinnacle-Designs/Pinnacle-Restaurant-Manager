import { DEMO_TOUR_STOPS } from "@/lib/marketing-content";

/** Demo tour routes that may be loaded via `/embed?path=…` */
export const EMBEDDABLE_DEMO_PATHS = DEMO_TOUR_STOPS.map((stop) => stop.path);

const EMBEDDABLE_DEMO_PATH_SET = new Set<string>(EMBEDDABLE_DEMO_PATHS);

export function resolveEmbedPath(raw: string | null | undefined): string {
  const path = raw?.trim() || DEMO_TOUR_STOPS[0].path;
  return EMBEDDABLE_DEMO_PATH_SET.has(path) ? path : DEMO_TOUR_STOPS[0].path;
}

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
export function getEmbedFrameAncestors(): string {
  // Local marketing previews (docs/index.html, Live Server, etc.) use a different origin.
  if (process.env.NODE_ENV === "development") {
    return "*";
  }

  const parts = ["'self'"];
  const extra = process.env.EMBED_FRAME_ANCESTORS?.trim();
  if (extra) {
    for (const origin of extra.split(/[\s,]+/)) {
      if (origin) parts.push(origin);
    }
  }
  return parts.join(" ");
}

export function isEmbeddableRequest(pathname: string, embedParam: string | null): boolean {
  return pathname === "/embed" || embedParam === "1";
}
