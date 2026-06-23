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
  hasEmbedSession,
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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const searchParams = useSearchParams();
  const embedParam = searchParams.get("embed");
  const isEmbed = isEmbeddableEmbedParam(embedParam);
  const stParam = searchParams.get("_st");
  const retryRef = useRef(0);

  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  // Instant demo user from `_st` JWT — no waiting on cookies or /api/auth/login.
  useEffect(() => {
    if (!isEmbed) return;
    if (stParam) {
      clearEmbedSessionCache();
    }
    const parsed = bootstrapEmbedUser(embedParam);
    if (parsed) {
      setUser(tokenToAuthUser(parsed));
      setLoading(false);
    }
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
    if (isEmbed && hasEmbedSession()) return true;
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
        embedSession: isEmbed && hasEmbedSession(),
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
