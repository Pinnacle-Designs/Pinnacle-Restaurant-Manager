"use client";

import { Download, Store } from "lucide-react";
import { Button } from "@/components/ui";
import { usePwaInstall } from "@/hooks/usePwaInstall";
import { getAppDownloadLinks, hasStoreListings } from "@/lib/app-download";
import { PLAN_BY_ID, type PlanId } from "@/lib/plans";
import { ManualInstallGuide } from "@/components/pwa/ManualInstallGuide";

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
    isIOS,
    isInAppBrowser,
    swReady,
    showManualInstallGuide,
  } = usePwaInstall();

  const { appStoreUrl, playStoreUrl } = getAppDownloadLinks();
  const storeListings = hasStoreListings();
  const planName = plan ? PLAN_BY_ID[plan].name : "your";

  return (
    <div className="text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-100">
        <Download className="h-7 w-7 text-orange-600" />
      </div>
      <h2 className="mt-4 text-lg font-semibold text-slate-900">Download Pinnacle on your device</h2>
      <p className="mt-2 text-sm text-slate-600">
        Your {planName} plan is ready. Install from the App Store or Google Play when available, or add
        Pinnacle to your home screen for quick access on phones and tablets.
      </p>

      {isInstalled ? (
        <div className="mt-6 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          Pinnacle is installed on this device. You&apos;re ready to go.
        </div>
      ) : (
        <div className="mt-6 space-y-4 text-left">
          {storeListings && (
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
              {appStoreUrl && (
                <a
                  href={appStoreUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800"
                >
                  <Store className="h-4 w-4" />
                  App Store
                </a>
              )}
              {playStoreUrl && (
                <a
                  href={playStoreUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800"
                >
                  <Store className="h-4 w-4" />
                  Google Play
                </a>
              )}
            </div>
          )}

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

          {showManualInstallGuide && (
            <ManualInstallGuide isIOS={isIOS} swReady={swReady} isInAppBrowser={isInAppBrowser} />
          )}
        </div>
      )}

      <div
        className={`mt-6 flex gap-2 ${embedded ? "flex-col-reverse sm:flex-row sm:justify-end" : "flex-col sm:flex-row sm:justify-center"}`}
      >
        {!isInstalled && (
          <Button type="button" variant="secondary" onClick={onContinue}>
            Continue in browser
          </Button>
        )}
        <Button type="button" onClick={onContinue}>
          {isInstalled ? "Open app" : "Go to dashboard"}
        </Button>
      </div>
      <p className="mt-4 text-center text-xs text-slate-500">
        By using Pinnacle you agree to our{" "}
        <a href="/terms" className="font-medium text-orange-600 hover:text-orange-500">
          Terms
        </a>{" "}
        and{" "}
        <a href="/privacy" className="font-medium text-orange-600 hover:text-orange-500">
          Privacy Policy
        </a>
        .
      </p>
    </div>
  );
}
