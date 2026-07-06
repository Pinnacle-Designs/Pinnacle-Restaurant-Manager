"use client";

import { useEffect, useState } from "react";
import type { EmbedChrome } from "@/lib/embed-config";

const MOBILE_EMBED_QUERY = "(max-width: 1023px)";

export { MOBILE_EMBED_QUERY as MOBILE_EMBED_MEDIA };

function readEmbedChrome(): EmbedChrome {
  if (typeof window === "undefined") return "full";
  return window.matchMedia(MOBILE_EMBED_QUERY).matches ? "mobile" : "full";
}

/** Pick mobile vs desktop chrome for demo iframes based on viewport width. */
export function useEmbedChrome(): EmbedChrome {
  const [chrome, setChrome] = useState<EmbedChrome>(readEmbedChrome);

  useEffect(() => {
    const mq = window.matchMedia(MOBILE_EMBED_QUERY);
    const sync = () => setChrome(mq.matches ? "mobile" : "full");
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  return chrome;
}

export function isMobileEmbedViewport(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia(MOBILE_EMBED_QUERY).matches;
}
