"use client";

import Link from "next/link";
import type { ComponentProps } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import { isEmbeddableEmbedParam } from "@/lib/embed-config";
import { EMBED_SESSION_PARAM } from "@/lib/embed-constants";
import { persistEmbedSessionToken } from "@/lib/embed-api-client";

/** Preserve `?embed=` and `&_st=` on a path (for Link, router.push, etc.). */
export function appendEmbedParams(
  href: string,
  searchParams: URLSearchParams
): string {
  const embed = searchParams.get("embed");
  if (!isEmbeddableEmbedParam(embed)) return href;

  const value = embed === "1" ? "mobile" : embed;
  let url = href.includes("embed=")
    ? href
    : `${href}${href.includes("?") ? "&" : "?"}embed=${value}`;

  // Only use `_st` from the URL so SSR and hydration see the same href.
  const st = searchParams.get(EMBED_SESSION_PARAM);
  if (st) {
    persistEmbedSessionToken(st);
    if (!url.includes(`${EMBED_SESSION_PARAM}=`)) {
      url = `${url}${url.includes("?") ? "&" : "?"}${EMBED_SESSION_PARAM}=${encodeURIComponent(st)}`;
    }
  }

  return url;
}

/** Preserve `?embed=` and `&_st=` when navigating inside an iframe demo. */
export function useEmbedHref(href: string): string {
  const searchParams = useSearchParams();
  return appendEmbedParams(href, searchParams);
}

export function useEmbedRouter() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const push = useCallback(
    (href: string) => router.push(appendEmbedParams(href, searchParams)),
    [router, searchParams]
  );

  const replace = useCallback(
    (href: string) => router.replace(appendEmbedParams(href, searchParams)),
    [router, searchParams]
  );

  return { push, replace };
}

export function EmbedNavLink({
  href,
  ...props
}: ComponentProps<typeof Link>) {
  const resolvedHref = useEmbedHref(typeof href === "string" ? href : (href.pathname ?? "/"));
  return <Link href={resolvedHref} {...props} />;
}
