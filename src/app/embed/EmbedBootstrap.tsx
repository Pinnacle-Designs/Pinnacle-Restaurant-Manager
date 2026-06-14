"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { launchDemo } from "@/lib/demo-launch";
import { needsCrossOriginEmbedCookies, resolveEmbedPath } from "@/lib/embed-config";

export function EmbedBootstrap() {
  const searchParams = useSearchParams();
  const pathParam = searchParams.get("path");
  const [error, setError] = useState<string | null>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    const path = resolveEmbedPath(pathParam);
    const target = `${path}?embed=1`;
    const crossOrigin = needsCrossOriginEmbedCookies();

    launchDemo("owner@pinnacle.com", "demo1234", "seeded", {
      embed: crossOrigin,
    })
      .then(() => {
        // Hard navigation — avoids client-router loops re-running this bootstrap.
        window.location.replace(target);
      })
      .catch((err) => {
        startedRef.current = false;
        setError(err instanceof Error ? err.message : "Demo failed to load");
      });
  }, [pathParam]);

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 px-4 text-center text-white">
        <p className="text-red-400">{error}</p>
        <a href="/login" className="mt-4 text-sm text-orange-400 underline">
          Sign in manually
        </a>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 text-white">
      <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
      <p className="mt-4 text-sm text-slate-300">Loading demo restaurant…</p>
    </div>
  );
}
