"use client";

import {
  Children,
  isValidElement,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import { ChevronDown, Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface TabPillProps {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  className?: string;
  variant?: "default" | "dark";
  id?: string;
}

interface ParsedTab extends TabPillProps {
  tabId: string;
}

interface ScrollableTabsProps {
  children: ReactNode;
  className?: string;
  /** lg+ layout: vertical stack (e.g. account sidebar) */
  verticalAtLg?: boolean;
  verticalClassName?: string;
  /** Label on the mobile hamburger trigger */
  menuLabel?: string;
}

/** Stable marker — survives barrel re-exports and minification better than reference equality. */
const TAB_PILL_MARKER = Symbol.for("pinnacle.TabPill");

function isTabPillElement(child: React.ReactElement): child is ReactElement<TabPillProps> {
  if (!isValidElement(child)) return false;
  const type = child.type;
  if (type === TabPill) return true;
  if (typeof type === "function") {
    const fn = type as { displayName?: string; [TAB_PILL_MARKER]?: boolean };
    if (fn.displayName === "TabPill" || fn[TAB_PILL_MARKER]) return true;
  }
  return false;
}

function parseTabPills(children: ReactNode): ParsedTab[] {
  return Children.toArray(children)
    .filter((child): child is ReactElement<TabPillProps> => isTabPillElement(child as ReactElement))
    .map((child, index) => ({
      ...child.props,
      tabId: child.props.id ?? String(child.key ?? index),
    }));
}

/** Desktop tab row only — never add bare `flex` here; display comes from `hidden md:flex` / `hidden lg:flex`. */
const desktopRowClass =
  "w-full min-w-0 flex-wrap items-center gap-2 overflow-x-auto overscroll-x-contain pb-1 [-webkit-overflow-scrolling:touch] scroll-smooth snap-x snap-mandatory";

/** Desktop: full tab row. Below md (or lg for verticalAtLg): hamburger menu with every tab. */
export function ScrollableTabs({
  children,
  className,
  verticalAtLg,
  verticalClassName,
  menuLabel = "Sections",
}: ScrollableTabsProps) {
  const tabs = useMemo(() => parseTabPills(children), [children]);
  const [menuOpen, setMenuOpen] = useState(false);

  const activeTab = tabs.find((t) => t.active) ?? tabs[0];
  const closeMenu = useCallback(() => setMenuOpen(false), []);

  useEffect(() => {
    if (!menuOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeMenu();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [menuOpen, closeMenu]);

  useEffect(() => {
    if (!menuOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [menuOpen]);

  const mobileOnly = verticalAtLg ? "lg:hidden" : "md:hidden";
  const desktopOnly = verticalAtLg
    ? cn(
        "hidden lg:flex lg:flex-col lg:flex-nowrap lg:items-stretch lg:overflow-x-visible lg:overflow-y-auto lg:gap-1 lg:pb-0 lg:snap-none",
        verticalClassName
      )
    : cn("hidden md:flex md:flex-row", desktopRowClass);

  return (
    <div className={cn("no-print relative min-w-0", className)}>
      {tabs.length > 0 ? (
        <>
          <div className={mobileOnly}>
            <button
              type="button"
              aria-expanded={menuOpen}
              aria-haspopup="listbox"
              onClick={() => setMenuOpen((open) => !open)}
              className="flex min-h-[44px] w-full items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-left text-sm font-medium text-slate-900 shadow-sm"
            >
              <span className="flex min-w-0 items-center gap-2">
                <Menu className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />
                <span className="truncate">
                  {activeTab ? (
                    <>
                      <span className="text-xs font-normal text-slate-500">{menuLabel}: </span>
                      {activeTab.children}
                    </>
                  ) : (
                    menuLabel
                  )}
                </span>
              </span>
              <ChevronDown
                className={cn(
                  "h-4 w-4 shrink-0 text-slate-400 transition-transform",
                  menuOpen && "rotate-180"
                )}
                aria-hidden
              />
            </button>

            {menuOpen && (
              <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={menuLabel}>
                <button
                  type="button"
                  className="absolute inset-0 border-0 bg-slate-900/45"
                  aria-label="Close menu"
                  onClick={closeMenu}
                />
                <div className="absolute bottom-0 left-0 right-0 flex max-h-[70vh] flex-col rounded-t-2xl bg-white pb-[env(safe-area-inset-bottom,0px)] shadow-[0_-8px_24px_rgba(15,23,42,0.12)]">
                  <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
                    <span className="text-sm font-semibold text-slate-900">{menuLabel}</span>
                    <button
                      type="button"
                      className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-500 hover:bg-slate-200"
                      aria-label="Close menu"
                      onClick={closeMenu}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <ul className="min-h-0 flex-1 overflow-y-auto px-2 py-2" role="listbox">
                    {tabs.map((tab) => (
                      <li key={tab.tabId} role="option" aria-selected={tab.active}>
                        <button
                          type="button"
                          onClick={() => {
                            tab.onClick();
                            closeMenu();
                          }}
                          className={cn(
                            "flex min-h-[44px] w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors",
                            tab.variant === "dark"
                              ? tab.active
                                ? "bg-slate-900 text-white"
                                : "text-slate-700 hover:bg-slate-100"
                              : tab.active
                                ? "bg-orange-50 text-orange-700"
                                : "text-slate-700 hover:bg-slate-50",
                            tab.className
                          )}
                        >
                          {tab.children}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </div>

          <div className={desktopOnly}>{children}</div>
        </>
      ) : (
        children
      )}
    </div>
  );
}

export function TabPill({
  active,
  onClick,
  children,
  className,
  variant = "default",
}: TabPillProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex min-h-[44px] shrink-0 snap-start items-center justify-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors sm:min-h-[36px] sm:py-2",
        variant === "dark"
          ? active
            ? "bg-slate-900 text-white"
            : "text-slate-600 hover:bg-slate-100"
          : active
            ? "bg-orange-50 text-orange-700"
            : "text-slate-600 hover:bg-slate-100",
        className
      )}
    >
      {children}
    </button>
  );
}

TabPill.displayName = "TabPill";
(TabPill as unknown as { [TAB_PILL_MARKER]: boolean })[TAB_PILL_MARKER] = true;
