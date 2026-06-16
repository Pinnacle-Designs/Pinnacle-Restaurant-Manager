"use client";

import Link from "next/link";
import Image from "next/image";
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
  Clock,
  Settings,
  Shield,
  Zap,
  ChefHat,
  Truck,
  ThermometerSnowflake,
  Soup,
  PieChart,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "@/lib/constants";
import { LocationSwitcher } from "@/components/layout/LocationSwitcher";
import { Logo } from "@/components/layout/Logo";
import { EmbedNavLink } from "@/components/layout/useEmbedHref";
import { useAuth } from "@/components/auth/AuthProvider";
import { filterNavForUser, ROLE_LABELS, ROLE_COLORS } from "@/lib/permissions";
import { PLAN_BY_ID } from "@/lib/plans";
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
  clock: Clock,
  zap: Zap,
  "chef-hat": ChefHat,
  truck: Truck,
  "thermometer-snowflake": ThermometerSnowflake,
  soup: Soup,
  "pie-chart": PieChart,
};

export function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  const navItems = user
    ? filterNavForUser(user.role, user.plan, NAV_ITEMS, user.permissions)
    : NAV_ITEMS;

  return (
    <aside className="hidden w-64 flex-col border-r bg-slate-900 md:flex">
      <div className="flex h-16 items-center border-b border-slate-700 px-4">
        <Logo href="/dashboard" priority />
      </div>
      <nav className="flex-1 space-y-1 p-4">
        {navItems.map((item) => {
          const Icon = ICONS[item.icon] ?? ClipboardList;
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
        {user?.isPlatformAdmin && (
          <EmbedNavLink
            href="/admin"
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
              pathname === "/admin"
                ? "bg-orange-500 text-white"
                : "text-slate-300 hover:bg-slate-800 hover:text-white"
            )}
          >
            <Shield className="h-5 w-5" />
            Platform admin
          </EmbedNavLink>
        )}
      </nav>
      {user && (
        <div className="border-t border-slate-700 p-4">
          <Link
            href="/account"
            className={cn(
              "flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-slate-800",
              pathname === "/account" && "bg-slate-800"
            )}
          >
            {user.avatarUrl ? (
              <Image
                src={user.avatarUrl}
                alt=""
                width={36}
                height={36}
                className="h-9 w-9 shrink-0 rounded-full object-cover"
              />
            ) : (
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-orange-500/20 text-sm font-semibold text-orange-300">
                {user.name.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-white">{user.name}</p>
              <div className="mt-0.5 flex flex-wrap gap-1">
                <Badge className={cn("text-[10px]", ROLE_COLORS[user.role])}>
                  {ROLE_LABELS[user.role]}
                </Badge>
                {user.plan && (
                  <Badge className="bg-slate-700 text-[10px] text-slate-200">
                    {PLAN_BY_ID[user.plan].name}
                  </Badge>
                )}
              </div>
            </div>
            <Settings className="h-4 w-4 shrink-0 text-slate-500" />
          </Link>
          <button
            type="button"
            onClick={logout}
            className="mt-3 flex w-full items-center gap-2 px-2 text-xs text-slate-400 hover:text-white"
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
