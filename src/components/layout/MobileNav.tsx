"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
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
  Share2,
  BarChart3,
  Clock,
  Menu,
  X,
  Zap,
  ChefHat,
  Truck,
  ThermometerSnowflake,
  Soup,
  PieChart,
  Sparkles,
  BookOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { MOBILE_PRIMARY_NAV_HREFS, NAV_ITEMS } from "@/lib/constants";
import { useAuth } from "@/components/auth/AuthProvider";
import { filterNavForUser } from "@/lib/permissions";
import { EmbedNavLink } from "@/components/layout/useEmbedHref";

type NavItem = { href: string; label: string; icon: string };

const PRIMARY_HREF_SET = new Set<string>(MOBILE_PRIMARY_NAV_HREFS);

function getMobileNavItems(items: readonly NavItem[]) {
  const byHref = new Map(items.map((item) => [item.href, item]));
  return MOBILE_PRIMARY_NAV_HREFS.map((href) => byHref.get(href)).filter(
    (item): item is NavItem => !!item
  );
}

function getMoreNavItems(items: readonly NavItem[]) {
  return items.filter((item) => !PRIMARY_HREF_SET.has(item.href));
}

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
  sparkles: Sparkles,
  "book-open": BookOpen,
};

function mobileNavLabel(item: NavItem) {
  return item.href === "/insights" ? "AI" : item.label;
}

function NavLink({
  item,
  isActive,
  label,
  onNavigate,
}: {
  item: NavItem;
  isActive: boolean;
  label?: string;
  onNavigate?: () => void;
}) {
  const Icon = ICONS[item.icon] ?? ClipboardList;
  return (
    <EmbedNavLink
      href={item.href}
      onClick={onNavigate}
      className={cn(
        "flex min-w-0 flex-1 flex-col items-center gap-0.5 px-1 py-2 text-[0.625rem] sm:py-1",
        isActive ? "text-orange-600" : "text-slate-500"
      )}
    >
      <Icon className="h-[1.125rem] w-[1.125rem] shrink-0" />
      <span className="max-w-full truncate">{label ?? item.label}</span>
    </EmbedNavLink>
  );
}

export function MobileNav() {
  const pathname = usePathname();
  const { user } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  const navItems = user ? filterNavForUser(user.role, user.plan, NAV_ITEMS) : NAV_ITEMS;
  const mobileNavItems = useMemo(() => getMobileNavItems(navItems), [navItems]);
  const moreNavItems = useMemo(() => getMoreNavItems(navItems), [navItems]);
  const isMoreNavScreen = moreNavItems.some((item) => item.href === pathname);

  const closeMenu = useCallback(() => setMenuOpen(false), []);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeMenu();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [menuOpen, closeMenu]);

  return (
    <>
      {menuOpen && moreNavItems.length > 0 && (
        <div
          id="mobile-more-menu"
          className="fixed inset-0 z-40 md:hidden"
          role="dialog"
          aria-label="All modules"
        >
          <button
            type="button"
            className="absolute inset-0 border-0 bg-slate-900/45"
            aria-label="Close menu"
            onClick={closeMenu}
          />
          <div className="absolute bottom-0 left-0 right-0 flex max-h-[70vh] min-h-48 flex-col rounded-t-2xl bg-white pb-[calc(5rem+env(safe-area-inset-bottom,0px))] shadow-[0_-8px_24px_rgba(15,23,42,0.12)]">
            <div className="flex shrink-0 items-center justify-between gap-3 px-4 pb-2 pt-3.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                All modules
              </span>
              <button
                type="button"
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-700"
                aria-label="Close menu"
                onClick={closeMenu}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
              {moreNavItems.map((item) => {
                const Icon = ICONS[item.icon] ?? ClipboardList;
                const isActive = pathname === item.href;
                return (
                  <EmbedNavLink
                    key={item.href}
                    href={item.href}
                    onClick={closeMenu}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium",
                      isActive
                        ? "bg-orange-50 text-orange-600"
                        : "text-slate-700 hover:bg-slate-50"
                    )}
                  >
                    <Icon className="h-5 w-5 shrink-0" />
                    <span>{item.label}</span>
                  </EmbedNavLink>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <nav className="no-print fixed bottom-0 left-0 right-0 z-50 border-t bg-white pb-[env(safe-area-inset-bottom,0px)] md:hidden">
        <div className="flex justify-around px-0.5 py-1.5">
          {mobileNavItems.map((item) => (
            <NavLink
              key={item.href}
              item={item}
              isActive={pathname === item.href}
              label={mobileNavLabel(item)}
            />
          ))}
          {moreNavItems.length > 0 && (
            <button
              type="button"
              aria-expanded={menuOpen}
              aria-controls="mobile-more-menu"
              aria-label="More modules"
              onClick={() => setMenuOpen((open) => !open)}
              className={cn(
                "flex min-w-0 flex-1 flex-col items-center gap-0.5 px-1 py-2 text-[0.625rem] sm:py-1",
                menuOpen || isMoreNavScreen ? "text-orange-600" : "text-slate-500"
              )}
            >
              <Menu className="h-[1.125rem] w-[1.125rem] shrink-0" />
              <span className="max-w-full truncate">More</span>
            </button>
          )}
        </div>
      </nav>
    </>
  );
}
