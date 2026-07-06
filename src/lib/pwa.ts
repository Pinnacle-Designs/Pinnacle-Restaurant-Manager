const VERSION_POLL_MS = 30 * 60 * 1000;
const SW_UPDATE_MS = 60 * 60 * 1000;

let activeVersion: string | null = null;
let updatePending = false;
let reloading = false;
let bootstrapped = false;

/** True when the app is opened from home screen / installed PWA. */
export function isStandalonePwa(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    ("standalone" in navigator &&
      (navigator as Navigator & { standalone?: boolean }).standalone === true)
  );
}

async function fetchAppVersion(): Promise<string | null> {
  try {
    const res = await fetch("/api/app-version", { cache: "no-store" });
    if (!res.ok) return null;
    const data = (await res.json()) as { version?: string };
    return data.version ?? null;
  } catch {
    return null;
  }
}

function reloadForUpdate() {
  if (reloading || typeof window === "undefined") return;
  reloading = true;
  window.location.reload();
}

/** Apply a pending app update when the user returns to the tab. */
function tryApplyPendingUpdate() {
  if (!updatePending || document.visibilityState !== "visible") return;
  reloadForUpdate();
}

async function pollAppVersion() {
  const version = await fetchAppVersion();
  if (!version) return;

  if (activeVersion === null) {
    activeVersion = version;
    return;
  }

  if (version !== activeVersion) {
    updatePending = true;
    const registration = await navigator.serviceWorker.getRegistration();
    if (registration) {
      await registration.update().catch(() => undefined);
    }
    tryApplyPendingUpdate();
  }
}

function watchServiceWorkerUpdates(registration: ServiceWorkerRegistration) {
  const onControllerChange = () => {
    if (!navigator.serviceWorker.controller) return;
    reloadForUpdate();
  };

  navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

  registration.addEventListener("updatefound", () => {
    const worker = registration.installing;
    if (!worker) return;

    worker.addEventListener("statechange", () => {
      if (worker.state === "installed" && navigator.serviceWorker.controller) {
        worker.postMessage({ type: "SKIP_WAITING" });
      }
    });
  });

  const checkSw = () => void registration.update().catch(() => undefined);
  checkSw();
  window.setInterval(checkSw, SW_UPDATE_MS);
}

function watchAppVersion() {
  const onVisible = () => {
    if (document.visibilityState !== "visible") return;
    void pollAppVersion().then(tryApplyPendingUpdate);
  };

  void pollAppVersion();
  window.setInterval(() => void pollAppVersion().then(tryApplyPendingUpdate), VERSION_POLL_MS);
  document.addEventListener("visibilitychange", onVisible);
  window.addEventListener("focus", onVisible);
}

function bootstrapAutoUpdate(registration: ServiceWorkerRegistration) {
  if (bootstrapped) return;
  bootstrapped = true;
  watchServiceWorkerUpdates(registration);
  watchAppVersion();
}

/** Register the service worker and keep installed apps on the latest deploy. */
export function registerPwaServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    return Promise.resolve(null);
  }

  return navigator.serviceWorker
    .register("/sw.js", { updateViaCache: "none" })
    .then((registration) => {
      bootstrapAutoUpdate(registration);
      return registration;
    })
    .catch(() => null);
}
