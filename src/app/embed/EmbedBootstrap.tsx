"use client";

import { useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { resolveEmbedPath } from "@/lib/embed-config";

export function EmbedBootstrap() {
  const searchParams = useSearchParams();
  const pathParam = searchParams.get("path");
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    const path = resolveEmbedPath(pathParam);
    window.location.replace(
      `/api/embed/launch?path=${encodeURIComponent(path)}&chrome=mobile`
    );
  }, [pathParam]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 text-white">
      <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
      <p className="mt-4 text-sm text-slate-300">Loading demo restaurant…</p>
    </div>
  );
}
