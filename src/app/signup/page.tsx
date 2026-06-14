import { Suspense } from "react";
import SignupForm from "./SignupForm";

export default function Page() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-slate-900 text-white">
          Loading...
        </div>
      }
    >
      <SignupForm />
    </Suspense>
  );
}
