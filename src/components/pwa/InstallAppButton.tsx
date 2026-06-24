"use client";

import { useState } from "react";
import Link from "next/link";
import { Download } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui";
import { Modal } from "@/components/ui/form";
import { usePwaInstall } from "@/hooks/usePwaInstall";
import { ManualInstallGuide } from "@/components/pwa/ManualInstallGuide";

interface InstallAppButtonProps {
  /** Dark header (mobile nav) vs light top bar (desktop). */
  variant?: "dark" | "light";
  className?: string;
}

export function InstallAppButton({ variant = "light", className }: InstallAppButtonProps) {
  const {
    canNativeInstall,
    install,
    installing,
    isInstalled,
    isIOS,
    isInAppBrowser,
    swReady,
    showManualInstallGuide,
  } = usePwaInstall();
  const [modalOpen, setModalOpen] = useState(false);

  if (isInstalled) return null;

  const handleClick = async () => {
    if (canNativeInstall) {
      const ok = await install();
      if (!ok) setModalOpen(true);
      return;
    }
    setModalOpen(true);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => void handleClick()}
        disabled={installing}
        className={cn(
          "inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 sm:px-3 sm:text-sm",
          "min-h-[44px] min-w-[44px]",
          variant === "dark"
            ? "border border-slate-600 bg-slate-800 text-white hover:bg-slate-700"
            : "border border-slate-200 bg-white text-slate-700 shadow-sm hover:bg-slate-50",
          className
        )}
        aria-label="Install app"
      >
        <Download className="h-4 w-4" />
        <span>{installing ? "Installing…" : "Install"}</span>
      </button>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Install Pinnacle" size="md">
        <p className="text-sm text-slate-600">
          Add Pinnacle to your home screen or desktop for quick access — works like a native app.
        </p>
        <div className="mt-4 space-y-4">
          {canNativeInstall && (
            <Button type="button" className="w-full" onClick={() => void install()} disabled={installing}>
              <Download className="h-4 w-4" />
              {installing ? "Installing…" : "Install app"}
            </Button>
          )}
          {showManualInstallGuide && (
            <ManualInstallGuide isIOS={isIOS} swReady={swReady} isInAppBrowser={isInAppBrowser} />
          )}
          <p className="text-center text-xs text-slate-500">
            <Link href="/download" className="font-medium text-orange-600 hover:text-orange-500">
              Open full download page
            </Link>
          </p>
        </div>
      </Modal>
    </>
  );
}
