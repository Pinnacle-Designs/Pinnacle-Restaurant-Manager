"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import {
  bootstrapEmbedSession,
  ensureEmbedUrlHasSession,
  getEmbedSessionToken,
} from "@/lib/embed-api-client";
import { EMBED_READY_MESSAGE_TYPE } from "@/lib/embed-constants";
import { useAuth } from "@/components/auth/AuthProvider";

/** Runs in embed mode: persist session token, patch fetch, sync URL, refresh auth. */
export function EmbedSessionBootstrap() {
  const searchParams = useSearchParams();
  const embed = searchParams.get("embed");
  const st = searchParams.get("_st");
  const { refresh } = useAuth();

  useEffect(() => {
    bootstrapEmbedSession(embed);
    ensureEmbedUrlHasSession();

    if (getEmbedSessionToken()) {
      void refresh();
    }

    if (typeof window === "undefined" || window.parent === window || !embed) return;
    const path = window.location.pathname;
    if (path === "/api/embed/launch" || path === "/embed") return;

    const notify = () => {
      try {
        window.parent.postMessage(
          { type: EMBED_READY_MESSAGE_TYPE, path },
          window.location.origin
        );
      } catch {
        /* ignore */
      }
    };

    notify();
    const timer = window.setTimeout(notify, 400);
    return () => window.clearTimeout(timer);
  }, [embed, st, refresh]);

  return null;
}
