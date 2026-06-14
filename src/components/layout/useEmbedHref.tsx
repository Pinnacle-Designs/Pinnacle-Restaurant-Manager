"use client";

import Link from "next/link";
import type { ComponentProps } from "react";
import { useSearchParams } from "next/navigation";
import { isEmbeddableEmbedParam } from "@/lib/embed-config";

/** Preserve ?embed=mobile|full when navigating inside an iframe demo. */
export function useEmbedHref(href: string): string {
  const searchParams = useSearchParams();
  const embed = searchParams.get("embed");
  if (!isEmbeddableEmbedParam(embed)) return href;
  const value = embed === "1" ? "mobile" : embed;
  if (href.includes("embed=")) return href;
  return `${href}${href.includes("?") ? "&" : "?"}embed=${value}`;
}

export function EmbedNavLink({
  href,
  ...props
}: ComponentProps<typeof Link>) {
  const resolvedHref = useEmbedHref(typeof href === "string" ? href : (href.pathname ?? "/"));
  return <Link href={resolvedHref} {...props} />;
}
