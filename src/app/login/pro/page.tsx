import { Suspense } from "react";
import ProCleanLoginForm from "./ProCleanLoginForm";

export default function ProCleanLoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-slate-950 text-white">
          Loading…
        </div>
      }
    >
      <ProCleanLoginForm />
    </Suspense>
  );
}
