"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Camera,
  Utensils,
  Package,
  Users,
  ClipboardList,
  DollarSign,
  Brain,
  LayoutGrid,
  LogOut,
  Share2,
  BarChart3,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "@/lib/constants";
import { LocationSwitcher } from "@/components/layout/LocationSwitcher";
import { Logo } from "@/components/layout/Logo";
import { EmbedNavLink } from "@/components/layout/useEmbedHref";
import { useAuth } from "@/components/auth/AuthProvider";
import { filterNavForRole, ROLE_LABELS, ROLE_COLORS } from "@/lib/permissions";
import { Badge } from "@/components/ui";

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  "layout-dashboard": LayoutDashboard,
  camera: Camera,
  utensils: Utensils,
  package: Package,
  users: Users,
  "layout-grid": LayoutGrid,
  "clipboard-list": ClipboardList,
  "dollar-sign": DollarSign,
  brain: Brain,
  "share-2": Share2,
  "bar-chart-3": BarChart3,
};

export function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  const navItems = user ? filterNavForRole(user.role, NAV_ITEMS) : NAV_ITEMS;

  return (
    <aside className="hidden w-64 flex-col border-r bg-slate-900 md:flex">
      <div className="flex h-16 items-center border-b border-slate-700 px-4">
        <Logo href="/dashboard" priority />
      </div>
      <nav className="flex-1 space-y-1 p-4">
        {navItems.map((item) => {
          const Icon = ICONS[item.icon];
          const isActive = pathname === item.href;
          return (
            <EmbedNavLink
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                isActive
                  ? "bg-orange-500 text-white"
                  : "text-slate-300 hover:bg-slate-800 hover:text-white"
              )}
            >
              <Icon className="h-5 w-5" />
              {item.label}
            </EmbedNavLink>
          );
        })}
      </nav>
      {user && (
        <div className="border-t border-slate-700 p-4">
          <p className="truncate text-sm font-medium text-white">{user.name}</p>
          <Badge className={cn("mt-1", ROLE_COLORS[user.role])}>
            {ROLE_LABELS[user.role]}
          </Badge>
          <button
            type="button"
            onClick={logout}
            className="mt-3 flex w-full items-center gap-2 text-xs text-slate-400 hover:text-white"
          >
            <LogOut className="h-3 w-3" />
            Sign out
          </button>
        </div>
      )}
      <LocationSwitcher />
    </aside>
  );
}
