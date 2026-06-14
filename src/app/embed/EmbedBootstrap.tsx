"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { launchDemo } from "@/lib/demo-launch";
import { resolveEmbedPath } from "@/lib/embed-config";

export function EmbedBootstrap() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const path = resolveEmbedPath(searchParams.get("path"));

    launchDemo()
      .then(() => {
        router.replace(`${path}?embed=1`);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Demo failed to load");
      });
  }, [router, searchParams]);

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
