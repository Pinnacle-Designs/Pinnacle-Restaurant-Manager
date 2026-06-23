"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center text-center">
      <h2 className="text-xl font-semibold text-slate-900">Something went wrong</h2>
      <p className="mt-2 max-w-md text-sm text-slate-500">
        The app hit an error loading this page. Try refreshing the page or reopening the demo.
        {process.env.NODE_ENV === "development" && (
          <>
            {" "}
            For local dev, restart with{" "}
            <code className="rounded bg-slate-100 px-1">npm run fresh</code>.
          </>
        )}
      </p>
      <Button className="mt-6" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
