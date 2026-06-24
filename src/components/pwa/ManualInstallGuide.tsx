"use client";

import { ExternalLink, MonitorSmartphone, Share, Smartphone } from "lucide-react";

export function ManualInstallGuide({
  isIOS,
  swReady,
  isInAppBrowser,
}: {
  isIOS: boolean;
  swReady: boolean;
  isInAppBrowser?: boolean;
}) {
  if (isInAppBrowser) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-left">
        <p className="flex items-center gap-2 text-sm font-medium text-amber-900">
          <ExternalLink className="h-4 w-4 text-amber-600" />
          Open in your browser first
        </p>
        <p className="mt-2 text-sm text-amber-800">
          In-app browsers (Instagram, Facebook, etc.) cannot install apps. Tap the menu (⋯) and choose{" "}
          <strong>Open in Safari</strong> or <strong>Open in Chrome</strong>, then return to this page.
        </p>
      </div>
    );
  }

  if (isIOS) {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-left">
        <p className="flex items-center gap-2 text-sm font-medium text-slate-800">
          <Smartphone className="h-4 w-4 text-orange-500" />
          iPhone / iPad — Add to Home Screen
        </p>
        <ol className="mt-2 list-decimal space-y-2 pl-5 text-sm text-slate-600">
          <li>
            Use <strong>Safari</strong> (required on iPhone — Chrome cannot install PWAs)
          </li>
          <li>
            Tap <Share className="inline h-3.5 w-3.5 align-text-bottom" /> <strong>Share</strong> at the
            bottom of Safari
          </li>
          <li>
            Scroll and tap <strong>Add to Home Screen</strong>
          </li>
          <li>
            Tap <strong>Add</strong> in the top right
          </li>
        </ol>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-left">
      <p className="flex items-center gap-2 text-sm font-medium text-slate-800">
        <MonitorSmartphone className="h-4 w-4 text-orange-500" />
        Android — Install on this device
      </p>
      <ol className="mt-2 list-decimal space-y-2 pl-5 text-sm text-slate-600">
        <li>
          Use <strong>Chrome</strong> or <strong>Edge</strong> (not an in-app browser)
        </li>
        <li>
          Tap the browser menu <strong>⋮</strong> (top right)
        </li>
        <li>
          Choose <strong>Install app</strong>, <strong>Install Pinnacle</strong>, or{" "}
          <strong>Add to Home screen</strong>
        </li>
        <li>
          Confirm when prompted — the app icon will appear on your home screen
        </li>
      </ol>
      {swReady && (
        <p className="mt-3 text-xs text-slate-500">
          If no install option appears yet, refresh this page once — the app is preparing for install.
        </p>
      )}
    </div>
  );
}
