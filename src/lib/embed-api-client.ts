import { isEmbeddableEmbedParam } from "./embed-config";
import { EMBED_API_COOKIE_NAME, EMBED_SESSION_PARAM } from "./embed-constants";

export { EMBED_API_COOKIE_NAME, EMBED_SESSION_PARAM } from "./embed-constants";

const STORAGE_KEY = "pinnacle_embed_st";

declare global {
  interface Window {
    __PINNACLE_EMBED_ST__?: string;
  }
}

/** In-memory cache — survives when third-party iframes block sessionStorage/cookies. */
let memoryCachedToken: string | null = null;

export function isEmbedMode(): boolean {
  if (typeof window === "undefined") return false;
  const embed = new URLSearchParams(window.location.search).get("embed");
  return isEmbeddableEmbedParam(embed);
}

export function persistEmbedSessionToken(token: string | null | undefined): void {
  if (typeof window === "undefined" || !token?.trim()) return;
  const trimmed = token.trim();
  memoryCachedToken = trimmed;
  if (typeof window !== "undefined") {
    window.__PINNACLE_EMBED_ST__ = trimmed;
  }
  try {
    sessionStorage.setItem(STORAGE_KEY, trimmed);
  } catch {
    /* blocked in third-party iframes */
  }
}

export function getEmbedSessionToken(): string | null {
  if (typeof window === "undefined") return null;

  // URL `_st` always wins — normal browsers may have stale memory/cookie sessions.
  const fromUrl = new URLSearchParams(window.location.search).get(EMBED_SESSION_PARAM);
  if (fromUrl) {
    persistEmbedSessionToken(fromUrl);
    return fromUrl;
  }

  if (memoryCachedToken) return memoryCachedToken;

  if (window.__PINNACLE_EMBED_ST__) {
    memoryCachedToken = window.__PINNACLE_EMBED_ST__;
    return memoryCachedToken;
  }

  const match = document.cookie.match(
    new RegExp(`(?:^|;\\s*)${EMBED_API_COOKIE_NAME}=([^;]+)`)
  );
  if (match?.[1]) {
    const token = decodeURIComponent(match[1]);
    if (!parseEmbedSessionUser(token)) {
      return null;
    }
    persistEmbedSessionToken(token);
    return token;
  }

  try {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (stored) {
      if (!parseEmbedSessionUser(stored)) {
        sessionStorage.removeItem(STORAGE_KEY);
      } else {
        memoryCachedToken = stored;
        return stored;
      }
    }
  } catch {
    /* ignore */
  }

  return null;
}

/** Append Authorization header + optional `_st` for embed API requests. */
function embedFetchInit(init?: RequestInit): RequestInit {
  const next: RequestInit = { ...init, credentials: init?.credentials ?? "include" };
  if (!isEmbedMode()) return next;

  const token = getEmbedSessionToken();
  if (!token) return next;

  const headers = new Headers(init?.headers);
  if (!headers.has("authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  next.headers = headers;
  return next;
}

/** Append embed session token for API requests when httpOnly cookies are not sent. */
export function withEmbedSession(url: string): string {
  if (!isEmbedMode()) return url;

  const token = getEmbedSessionToken();
  if (!token) return url;

  if (typeof window === "undefined") return url;

  const resolved = new URL(url, window.location.origin);
  if (!resolved.searchParams.has(EMBED_SESSION_PARAM)) {
    resolved.searchParams.set(EMBED_SESSION_PARAM, token);
  }
  return `${resolved.pathname}${resolved.search}`;
}

/** Keep `_st` in the address bar so SSR and full reloads stay authenticated. */
export function ensureEmbedUrlHasSession(): void {
  if (typeof window === "undefined" || !isEmbedMode()) return;

  const token = getEmbedSessionToken();
  if (!token) return;

  const url = new URL(window.location.href);
  if (url.searchParams.get(EMBED_SESSION_PARAM) === token) return;

  url.searchParams.set(EMBED_SESSION_PARAM, token);
  window.history.replaceState(window.history.state, "", url.toString());
}

/** Persist `_st` from the URL/cookie and patch fetch for iframe demos. */
export function bootstrapEmbedSession(embedParam: string | null): void {
  if (!isEmbeddableEmbedParam(embedParam)) return;
  const params = new URLSearchParams(window.location.search);
  const st = params.get(EMBED_SESSION_PARAM);
  if (st) {
    persistEmbedSessionToken(st);
  } else {
    getEmbedSessionToken();
  }
  installEmbedFetchPatch();
  ensureEmbedUrlHasSession();
}

/** Drop cached embed tokens when starting a fresh demo launch. */
export function clearEmbedSessionCache(): void {
  memoryCachedToken = null;
  if (typeof window !== "undefined") {
    delete window.__PINNACLE_EMBED_ST__;
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }
}

let fetchPatched = false;

/** Ensure every `/api/*` call in an embed carries credentials + `_st`. */
export function installEmbedFetchPatch(): void {
  if (typeof window === "undefined" || fetchPatched) return;
  if (!isEmbedMode()) return;

  fetchPatched = true;
  const originalFetch = window.fetch.bind(window);

  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const patchedInit = embedFetchInit(init);

    if (typeof input === "string") {
      const url = input.startsWith("/api/") ? withEmbedSession(input) : input;
      return originalFetch(url, patchedInit);
    }

    if (input instanceof URL) {
      const url = input.pathname.startsWith("/api/")
        ? withEmbedSession(input.toString())
        : input.toString();
      return originalFetch(url, patchedInit);
    }

    if (input instanceof Request) {
      try {
        const parsed = new URL(input.url);
        if (parsed.origin === window.location.origin && parsed.pathname.startsWith("/api/")) {
          const patched = withEmbedSession(`${parsed.pathname}${parsed.search}`);
          return originalFetch(new Request(patched, input), patchedInit);
        }
      } catch {
        /* ignore malformed URLs */
      }
    }

    return originalFetch(input, patchedInit);
  };
}

export function clientFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const credentials = init?.credentials ?? "include";
  if (!isEmbedMode()) {
    if (typeof input === "string") {
      return fetch(input, { ...init, credentials });
    }
    if (input instanceof URL) {
      return fetch(input.toString(), { ...init, credentials });
    }
    return fetch(input, { ...init, credentials });
  }

  installEmbedFetchPatch();
  const patchedInit = embedFetchInit(init);

  if (typeof input === "string") {
    return fetch(withEmbedSession(input), patchedInit);
  }
  if (input instanceof URL) {
    const url = input.pathname.startsWith("/api/") ? withEmbedSession(input.toString()) : input.toString();
    return fetch(url, patchedInit);
  }
  return fetch(input, patchedInit);
}

/** True when the demo iframe has (or can restore) an embed session token. */
export function hasEmbedSession(): boolean {
  return isEmbedMode() && Boolean(getEmbedSessionToken());
}

/** Decode session JWT payload for instant embed UI (API still validates server-side). */
export function parseEmbedSessionUser(token: string | null | undefined): {
  id: string;
  email: string;
  name: string;
  role: string;
  locationId: string | null;
  plan?: string;
  permissions?: string[];
  setupComplete?: boolean;
  isPlatformAdmin?: boolean;
  mfaEnabled?: boolean;
  emailVerifiedAt?: string | null;
} | null {
  if (!token?.trim()) return null;
  try {
    const payload = token.trim().split(".")[0];
    if (!payload) return null;
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const data = JSON.parse(new TextDecoder().decode(bytes)) as {
      exp?: number;
      id?: string;
      email?: string;
      name?: string;
      role?: string;
      locationId?: string | null;
      plan?: string;
      permissions?: string[];
      setupComplete?: boolean;
      isPlatformAdmin?: boolean;
      mfaEnabled?: boolean;
      emailVerifiedAt?: string | null;
    };
    if (data.exp && data.exp < Date.now()) return null;
    if (!data.id || !data.email || !data.name || !data.role) return null;
    return {
      id: data.id,
      email: data.email,
      name: data.name,
      role: data.role,
      locationId: data.locationId ?? null,
      plan: data.plan,
      permissions: data.permissions,
      setupComplete: data.setupComplete,
      isPlatformAdmin: data.isPlatformAdmin,
      mfaEnabled: data.mfaEnabled,
      emailVerifiedAt: data.emailVerifiedAt,
    };
  } catch {
    return null;
  }
}

/** Bootstrap embed session and return decoded demo user when available. */
export function bootstrapEmbedUser(embedParam: string | null): ReturnType<typeof parseEmbedSessionUser> {
  bootstrapEmbedSession(embedParam);
  return parseEmbedSessionUser(getEmbedSessionToken());
}
