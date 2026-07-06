"use client";

import { useEffect } from "react";
import { registerPwaServiceWorker } from "@/lib/pwa";

/** Registers the service worker on every page so install prompts and auto-updates work. */
export function PwaBootstrap() {
  useEffect(() => {
    void registerPwaServiceWorker();
  }, []);

  return null;
}
