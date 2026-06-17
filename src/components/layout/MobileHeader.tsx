import { Logo } from "@/components/layout/Logo";

export function MobileHeader() {
  return (
    <header className="no-print sticky top-0 z-40 border-b bg-slate-900 px-4 py-3 md:hidden">
      <Logo priority />
    </header>
  );
}
