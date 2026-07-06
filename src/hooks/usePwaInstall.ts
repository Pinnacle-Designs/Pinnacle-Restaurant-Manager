"use client";

import { useCallback, useEffect, useState } from "react";
import { registerPwaServiceWorker, isStandalonePwa } from "@/lib/pwa";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function detectIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent) && !("MSStream" in window);
}

function detectInstalled(): boolean {
  return isStandalonePwa();
}

function detectInAppBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent.toLowerCase();
  return /(instagram|fbav|fban|facebook|line\/|twitter|snapchat|tiktok)/i.test(ua);
}

export function usePwaInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isInAppBrowser, setIsInAppBrowser] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [swReady, setSwReady] = useState(false);

  useEffect(() => {
    setIsIOS(detectIOS());
    setIsInstalled(detectInstalled());
    setIsInAppBrowser(detectInAppBrowser());

    void registerPwaServiceWorker().then((registration) => {
      setSwReady(Boolean(registration));
    });

    const onInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };

    const onInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", onInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", onInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const install = useCallback(async () => {
    if (!deferredPrompt) return false;
    setInstalling(true);
    try {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === "accepted") {
        setIsInstalled(true);
        setDeferredPrompt(null);
        return true;
      }
      return false;
    } finally {
      setInstalling(false);
    }
  }, [deferredPrompt]);

  const canNativeInstall = Boolean(deferredPrompt) && !isInAppBrowser;

  return {
    canNativeInstall,
    install,
    installing,
    isInstalled,
    isIOS,
    isInAppBrowser,
    swReady,
    showIOSInstructions: isIOS && !isInstalled,
    showManualInstallGuide: !isInstalled && (!canNativeInstall || isInAppBrowser),
  };
}
