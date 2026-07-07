"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { AppRole } from "@prisma/client";
import type { PlanId } from "@/lib/plans";
import type { Permission } from "@/lib/permissions";
import { hasPermissionInList } from "@/lib/permissions";
import { isEmbeddableEmbedParam } from "@/lib/embed-config";
import { parseJsonResponse } from "@/lib/fetch-json";
import {
  bootstrapEmbedUser,
  clearEmbedSessionCache,
  clientFetch,
  getEmbedSessionToken,
  parseEmbedSessionUser,
} from "@/lib/embed-api-client";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: AppRole;
  locationId: string | null;
  plan?: PlanId;
  avatarUrl?: string | null;
  permissions?: Permission[];
  setupComplete?: boolean;
  isPlatformAdmin?: boolean;
  mfaEnabled?: boolean;
  emailVerifiedAt?: string | null;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  can: (permission: Permission) => boolean;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  embedSession: boolean;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  can: () => false,
  logout: async () => {},
  refresh: async () => {},
  embedSession: false,
});

function tokenToAuthUser(parsed: NonNullable<ReturnType<typeof parseEmbedSessionUser>>): AuthUser {
  return {
    id: parsed.id,
    email: parsed.email,
    name: parsed.name,
    role: parsed.role as AppRole,
    locationId: parsed.locationId,
    plan: (parsed.plan as PlanId | undefined) ?? "PRO",
    permissions: parsed.permissions as Permission[] | undefined,
    setupComplete: parsed.setupComplete ?? true,
    isPlatformAdmin: parsed.isPlatformAdmin,
    mfaEnabled: parsed.mfaEnabled,
    emailVerifiedAt: parsed.emailVerifiedAt,
  };
}

/** Decode `_st` from the URL — safe on server and client (no window/cookies). */
function embedUserFromParam(stParam: string | null, isEmbed: boolean): AuthUser | null {
  if (!isEmbed || !stParam) return null;
  const parsed = parseEmbedSessionUser(stParam);
  return parsed ? tokenToAuthUser(parsed) : null;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const searchParams = useSearchParams();
  const embedParam = searchParams.get("embed");
  const isEmbed = isEmbeddableEmbedParam(embedParam);
  const stParam = searchParams.get("_st");
  const retryRef = useRef(0);

  const initialEmbedUser = embedUserFromParam(stParam, isEmbed);
  const [user, setUser] = useState<AuthUser | null>(initialEmbedUser);
  const [loading, setLoading] = useState(!initialEmbedUser);

  // Persist `_st` and sync user when the embed URL token changes.
  useEffect(() => {
    if (!isEmbed) return;
    if (stParam) {
      clearEmbedSessionCache();
      const fromUrl = embedUserFromParam(stParam, true);
      if (fromUrl) {
        setUser(fromUrl);
        setLoading(false);
      }
    }
    bootstrapEmbedUser(embedParam);
  }, [isEmbed, embedParam, stParam]);

  const refresh = useCallback(async () => {
    if (isEmbed) {
      bootstrapEmbedUser(embedParam);
    }

    const tokenUser = parseEmbedSessionUser(getEmbedSessionToken());

    try {
      const res = await clientFetch("/api/auth/login");
      const data = await parseJsonResponse<{ user: AuthUser | null }>(res);

      if (data.user) {
        if (
          isEmbed &&
          tokenUser &&
          tokenUser.email === "owner@pinnacle.com" &&
          data.user.email !== tokenUser.email
        ) {
          setUser(tokenToAuthUser(tokenUser));
        } else {
          setUser(data.user);
        }
        retryRef.current = 0;
        return;
      }

      if (tokenUser) {
        setUser(tokenToAuthUser(tokenUser));
        return;
      }

      if (isEmbed && getEmbedSessionToken() && retryRef.current < 4) {
        retryRef.current += 1;
        await new Promise((r) => setTimeout(r, 150 * retryRef.current));
        return refresh();
      }

      setUser(null);
    } catch {
      if (tokenUser) {
        setUser(tokenToAuthUser(tokenUser));
        return;
      }
      if (isEmbed && getEmbedSessionToken() && retryRef.current < 4) {
        retryRef.current += 1;
        await new Promise((r) => setTimeout(r, 150 * retryRef.current));
        return refresh();
      }
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, [isEmbed, embedParam]);

  useEffect(() => {
    retryRef.current = 0;
    void refresh();
  }, [refresh, stParam]);

  const logout = async () => {
    await clientFetch("/api/auth/logout", { method: "POST" });
    setUser(null);
    window.location.href = "/login";
  };

  const can = (permission: Permission) => {
    if (user?.permissions?.length) {
      return hasPermissionInList(user.permissions, permission);
    }
    if (user?.role === "OWNER" || user?.role === "MANAGER") return true;
    // URL `_st` only — must match SSR (no cookie/window token reads during render).
    if (isEmbed && stParam) return true;
    return false;
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        can,
        logout,
        refresh,
        embedSession: isEmbed && Boolean(stParam),
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
