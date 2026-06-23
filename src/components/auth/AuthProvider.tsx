"use client";

import { createContext, useContext, useEffect, useState } from "react";
import type { AppRole } from "@prisma/client";
import type { PlanId } from "@/lib/plans";
import type { Permission } from "@/lib/permissions";
import { hasPermissionInList } from "@/lib/permissions";
import { apiFetch } from "@/lib/api-fetch";
import { parseJsonResponse } from "@/lib/fetch-json";

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
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  can: () => false,
  logout: async () => {},
  refresh: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    try {
      const res = await apiFetch("/api/auth/login");
      const data = await parseJsonResponse<{ user: AuthUser | null }>(res);
      setUser(data.user ?? null);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const logout = async () => {
    await apiFetch("/api/auth/logout", { method: "POST" });
    setUser(null);
    window.location.href = "/login";
  };

  const can = (permission: Permission) => {
    if (!user) return false;
    if (user.permissions?.length) {
      return hasPermissionInList(user.permissions, permission);
    }
    return false;
  };

  return (
    <AuthContext.Provider value={{ user, loading, can, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
