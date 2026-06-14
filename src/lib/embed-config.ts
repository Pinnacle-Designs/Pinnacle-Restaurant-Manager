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

/** CSP `frame-ancestors` value for embeddable responses (`'self'` + optional env origins). */
export function getEmbedFrameAncestors(): string {
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
