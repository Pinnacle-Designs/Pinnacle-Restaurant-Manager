"use client";

import { Download, MonitorSmartphone, Share, Smartphone } from "lucide-react";
import { Button } from "@/components/ui";
import { usePwaInstall } from "@/hooks/usePwaInstall";
import { PLAN_BY_ID, type PlanId } from "@/lib/plans";

interface InstallAppPromptProps {
  plan?: PlanId;
  onContinue: () => void;
  embedded?: boolean;
}

export function InstallAppPrompt({ plan, onContinue, embedded }: InstallAppPromptProps) {
  const {
    canNativeInstall,
    install,
    installing,
    isInstalled,
    showIOSInstructions,
    showDesktopHint,
  } = usePwaInstall();

  const planName = plan ? PLAN_BY_ID[plan].name : "your";

  return (
    <div className="text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-100">
        <Download className="h-7 w-7 text-orange-600" />
      </div>
      <h2 className="mt-4 text-lg font-semibold text-slate-900">Install Pinnacle on your device</h2>
      <p className="mt-2 text-sm text-slate-600">
        Your {planName} plan is active. Add the app to your phone or tablet for quick access from your
        home screen — like a native app, without the app store.
      </p>

      {isInstalled ? (
        <div className="mt-6 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          Pinnacle is installed on this device. You&apos;re ready to go.
        </div>
      ) : (
        <div className="mt-6 space-y-4 text-left">
          {canNativeInstall && (
            <Button
              type="button"
              className="w-full"
              onClick={() => void install()}
              disabled={installing}
            >
              <Download className="h-4 w-4" />
              {installing ? "Installing…" : "Install app"}
            </Button>
          )}

          {showIOSInstructions && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <p className="flex items-center gap-2 text-sm font-medium text-slate-800">
                <Smartphone className="h-4 w-4 text-orange-500" />
                iPhone / iPad
              </p>
              <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-slate-600">
                <li>
                  Tap <Share className="inline h-3.5 w-3.5" /> Share in Safari
                </li>
                <li>Scroll down and tap <strong>Add to Home Screen</strong></li>
                <li>Tap <strong>Add</strong> to install Pinnacle</li>
              </ol>
            </div>
          )}

          {showDesktopHint && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <p className="flex items-center gap-2 text-sm font-medium text-slate-800">
                <MonitorSmartphone className="h-4 w-4 text-orange-500" />
                Desktop or Android
              </p>
              <p className="mt-2 text-sm text-slate-600">
                Open the browser menu and choose <strong>Install app</strong> or{" "}
                <strong>Add to Home screen</strong>. In Chrome, you may also see an install icon in
                the address bar.
              </p>
            </div>
          )}
        </div>
      )}

      <div className={`mt-6 flex gap-2 ${embedded ? "flex-col-reverse sm:flex-row sm:justify-end" : "flex-col sm:flex-row sm:justify-center"}`}>
        {!isInstalled && (
          <Button type="button" variant="secondary" onClick={onContinue}>
            Continue in browser
          </Button>
        )}
        <Button type="button" onClick={onContinue}>
          {isInstalled ? "Open your workspace" : "Go to dashboard"}
        </Button>
      </div>
    </div>
  );
}
