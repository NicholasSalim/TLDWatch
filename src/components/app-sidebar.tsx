"use client";

import { Suspense, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  History,
  Home,
  Lock,
  LogIn,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  X,
} from "lucide-react";
import type { HistoryItem } from "@/core/core";
import { summaryPath } from "@/core/share";
import { openSignIn, useMe } from "@/lib/me";
import { readPreference, writePreference } from "@/lib/preferences";
import { cn } from "@/lib/utils";
import { Wordmark } from "@/components/wordmark";

const ITEM =
  "flex h-10 w-full items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-lumen";

// Desktop collapse is a per-browser preference.
const collapseListeners = new Set<() => void>();
const subscribeCollapse = (listener: () => void) => {
  collapseListeners.add(listener);
  return () => collapseListeners.delete(listener);
};
const readCollapsed = () => readPreference("sidebar") === "collapsed";
function setCollapsed(collapsed: boolean) {
  writePreference("sidebar", collapsed ? "collapsed" : "open");
  collapseListeners.forEach((listener) => listener());
}

/**
 * The app's navigation: a left sidebar on desktop (collapsible to icons), a
 * top bar with a drawer on phones. Home, History, and the profile at the bottom.
 */
export function AppSidebar() {
  const collapsed = useSyncExternalStore(subscribeCollapse, readCollapsed, () => false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Escape closes the drawer.
  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setDrawerOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerOpen]);

  return (
    <>
      {/* Phones: a top bar with a menu button. */}
      <div className="sticky top-0 z-30 flex items-center gap-3 border-b border-white/8 bg-ink/80 px-4 py-3 backdrop-blur md:hidden">
        <button
          type="button"
          aria-label="Open menu"
          aria-expanded={drawerOpen}
          onClick={() => setDrawerOpen(true)}
          className="grid size-10 place-items-center rounded-xl text-mist hover:bg-white/8 focus-visible:outline-2 focus-visible:outline-lumen"
        >
          <Menu className="size-5" aria-hidden />
        </button>
        <Wordmark />
      </div>

      {/* Portaled to <body>: the layout's isolated backdrop would otherwise trap
          it beneath page-wide overlays such as the welcome notice. It only
          opens after a click, so document exists. */}
      {drawerOpen &&
        createPortal(
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            type="button"
            aria-label="Close menu"
            tabIndex={-1}
            onClick={() => setDrawerOpen(false)}
            className="absolute inset-0 bg-ink/70 backdrop-blur-sm"
          />
          <aside
            aria-label="Navigation"
            className="relative flex h-full w-72 max-w-[85vw] flex-col border-r border-white/10 bg-[#11163a] motion-safe:animate-[drawer-in_200ms_ease-out]"
          >
            <SidebarContent collapsed={false} onNavigate={() => setDrawerOpen(false)}>
              <button
                type="button"
                aria-label="Close menu"
                onClick={() => setDrawerOpen(false)}
                className="grid size-9 place-items-center rounded-lg text-haze hover:bg-white/8 hover:text-mist focus-visible:outline-2 focus-visible:outline-lumen"
              >
                <X className="size-5" aria-hidden />
              </button>
            </SidebarContent>
          </aside>
        </div>,
          document.body,
        )}

      {/* Desktop: a sidebar that can collapse to icons. */}
      <aside
        aria-label="Navigation"
        className={cn(
          "sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-white/8 bg-[#0b1029]/60 backdrop-blur transition-[width] duration-200 md:flex",
          collapsed ? "w-18" : "w-64",
        )}
      >
        <SidebarContent collapsed={collapsed}>
          <button
            type="button"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            onClick={() => setCollapsed(!collapsed)}
            className="grid size-9 place-items-center rounded-lg text-haze hover:bg-white/8 hover:text-mist focus-visible:outline-2 focus-visible:outline-lumen"
          >
            {collapsed ? (
              <PanelLeftOpen className="size-5" aria-hidden />
            ) : (
              <PanelLeftClose className="size-5" aria-hidden />
            )}
          </button>
        </SidebarContent>
      </aside>
    </>
  );
}

function SidebarContent({
  collapsed,
  onNavigate,
  children,
}: {
  collapsed: boolean;
  onNavigate?: () => void;
  /** The control at the top right: collapse, or close the drawer. */
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col p-3">
      <div className={cn("flex items-center gap-2 px-1 pt-1 pb-4", collapsed ? "flex-col" : "justify-between")}>
        <Wordmark compact={collapsed} />
        {children}
      </div>

      {/* Which link is active is only known per request on pages like /v/<id>. */}
      <Suspense fallback={<NavItems pathname={null} collapsed={collapsed} onNavigate={onNavigate} />}>
        <ActiveNavItems collapsed={collapsed} onNavigate={onNavigate} />
      </Suspense>

      <div className="mt-auto pt-3">
        <Profile collapsed={collapsed} onNavigate={onNavigate} />
      </div>
    </div>
  );
}

function ActiveNavItems(props: { collapsed: boolean; onNavigate?: () => void }) {
  return <NavItems pathname={usePathname()} {...props} />;
}

function NavItems({
  pathname,
  collapsed,
  onNavigate,
}: {
  pathname: string | null;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const me = useMe();
  const isMember = !!me?.member;

  return (
    <nav className="flex min-h-0 flex-1 flex-col gap-1">
      <NavLink href="/" icon={Home} label="Home" active={pathname === "/"} collapsed={collapsed} onNavigate={onNavigate} />

      {isMember ? (
        <NavLink
          href="/history"
          icon={History}
          label="History"
          active={pathname === "/history"}
          collapsed={collapsed}
          onNavigate={onNavigate}
        />
      ) : (
        // History is for Members: shown, greyed, and an invitation to sign in.
        <button
          type="button"
          onClick={openSignIn}
          title={collapsed ? "History · Members only" : undefined}
          className={cn(ITEM, "text-haze/60 hover:bg-white/5 hover:text-haze", collapsed && "justify-center px-0")}
        >
          <History className="size-5 shrink-0" aria-hidden />
          {!collapsed && (
            <>
              <span>History</span>
              <span className="ml-auto flex items-center gap-1 text-xs">
                <Lock className="size-3.5" aria-hidden />
                Members only
              </span>
            </>
          )}
          {collapsed && <span className="sr-only">History, Members only</span>}
        </button>
      )}

      {isMember && !collapsed && <RecentHistory pathname={pathname} onNavigate={onNavigate} />}
    </nav>
  );
}

function NavLink({
  href,
  icon: Icon,
  label,
  active,
  collapsed,
  onNavigate,
}: {
  href: string;
  icon: typeof Home;
  label: string;
  active: boolean;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      title={collapsed ? label : undefined}
      className={cn(
        ITEM,
        active ? "bg-white/10 text-mist" : "text-haze hover:bg-white/6 hover:text-mist",
        collapsed && "justify-center px-0",
      )}
    >
      <Icon className="size-5 shrink-0" aria-hidden />
      {collapsed ? <span className="sr-only">{label}</span> : label}
    </Link>
  );
}

/** The Member's latest History entries, like a chat app's recent conversations. */
function RecentHistory({ pathname, onNavigate }: { pathname: string | null; onNavigate?: () => void }) {
  const [items, setItems] = useState<HistoryItem[] | null>(null);

  // Refreshed on every page change, so a Summary just opened shows up.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/history", { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<HistoryItem[]>) : []))
      .then((list) => !cancelled && setItems(list.slice(0, 8)))
      .catch(() => !cancelled && setItems([]));
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  if (!items || items.length === 0) return null;
  return (
    <div className="mt-2 min-h-0 overflow-y-auto pl-2">
      <p className="px-3 pb-1 text-xs font-medium tracking-wide text-haze/70 uppercase">Recent</p>
      <ul className="space-y-0.5">
        {items.map((item) => {
          const href = summaryPath(item.videoId, item.language);
          return (
            <li key={item.videoId}>
              <Link
                href={href}
                onClick={onNavigate}
                className="block truncate rounded-lg px-3 py-1.5 text-sm text-haze hover:bg-white/6 hover:text-mist focus-visible:outline-2 focus-visible:outline-lumen"
              >
                {item.preview}
              </Link>
            </li>
          );
        })}
      </ul>
      <Link
        href="/history"
        onClick={onNavigate}
        className="mt-1 block rounded-lg px-3 py-1.5 text-sm text-lumen hover:bg-white/6 focus-visible:outline-2 focus-visible:outline-lumen"
      >
        See all
      </Link>
    </div>
  );
}

/** The profile at the bottom: a Member's menu (Settings, Sign out), or Sign in for a Guest. */
function Profile({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const me = useMe();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  // A click elsewhere, or Escape, closes the menu.
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onPointer);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!me) return <div className="h-12" aria-hidden />;

  if (!me.member) {
    return (
      <button
        type="button"
        onClick={openSignIn}
        title={collapsed ? "Sign in" : undefined}
        className={cn(ITEM, "h-11 bg-white/8 text-mist hover:bg-white/14", collapsed && "justify-center px-0")}
      >
        <LogIn className="size-5 shrink-0" aria-hidden />
        {collapsed ? <span className="sr-only">Sign in</span> : "Sign in"}
      </button>
    );
  }

  const { name, email, avatarUrl } = me.member;
  const label = name ?? email ?? "Member";
  return (
    <div ref={box} className="relative">
      {open && (
        <div
          role="menu"
          className={cn(
            "absolute bottom-full z-50 mb-2 w-56 rounded-xl border border-white/10 bg-[#151a3c] p-1.5 shadow-[0_16px_48px_-16px_rgb(0_0_0/0.8)]",
            collapsed ? "left-0" : "inset-x-0 w-auto",
          )}
        >
          {email && <p className="truncate px-2.5 py-1.5 text-xs text-haze">{email}</p>}
          <Link
            href="/settings"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onNavigate?.();
            }}
            className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-mist hover:bg-white/8 focus-visible:outline-2 focus-visible:outline-lumen"
          >
            <Settings className="size-4" aria-hidden />
            Settings
          </Link>
          <form method="post" action="/auth/sign-out">
            <button
              type="submit"
              role="menuitem"
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-mist hover:bg-white/8 focus-visible:outline-2 focus-visible:outline-lumen"
            >
              <LogOut className="size-4" aria-hidden />
              Sign out
            </button>
          </form>
        </div>
      )}
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        title={collapsed ? label : undefined}
        className={cn(
          "flex w-full items-center gap-3 rounded-xl p-2 text-left hover:bg-white/6 focus-visible:outline-2 focus-visible:outline-lumen",
          collapsed && "justify-center",
        )}
      >
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- small Google avatar
          <img src={avatarUrl} alt="" width={32} height={32} referrerPolicy="no-referrer" className="size-8 shrink-0 rounded-full" />
        ) : (
          <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-full bg-lumen font-medium text-ink">
            {label.charAt(0).toUpperCase()}
          </span>
        )}
        {collapsed ? (
          <span className="sr-only">{label}</span>
        ) : (
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium text-mist">{label}</span>
            <span className="block truncate text-xs text-haze">Member</span>
          </span>
        )}
      </button>
    </div>
  );
}
