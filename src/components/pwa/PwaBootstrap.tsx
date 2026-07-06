"use client";

import { useEffect } from "react";
import { isStandalonePwa, registerPwaServiceWorker } from "@/lib/pwa";

/** Registers the service worker on every page so install prompts and auto-updates work. */
export function PwaBootstrap() {
  useEffect(() => {
    void registerPwaServiceWorker();

    if (!isStandalonePwa()) return;
    const path = window.location.pathname;
    if (path === "/" || path === "/demo") {
      window.location.replace("/login");
    }
  }, []);

  return null;
}
