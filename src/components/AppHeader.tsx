"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { clsx } from "clsx";
import { ArrowLeft, Bell, FileText, LogOut, Map as MapIcon, MapPinned, Settings } from "lucide-react";
import { getReminderTimeStatus } from "@shared/reminderStatus";
import { useAuth, logout } from "@/lib/auth";
import { useData } from "@/lib/data";
import { firebaseMode } from "@/lib/firebase";
import { useNow } from "@/lib/hooks";
import { confirmLeave } from "@/lib/unsaved";
import { MapSearch } from "./MapSearch";

export const APP_NAME = "거래처 관리 지도";

const LINKS = [
  { href: "/map", label: "지도", icon: MapIcon },
  { href: "/templates", label: "템플릿", icon: FileText },
  { href: "/notifications", label: "알림", icon: Bell },
  { href: "/settings", label: "설정", icon: Settings },
];

export function isFocusRoute(pathname: string) {
  return pathname.startsWith("/accounts/") || /^\/templates\/.+/.test(pathname);
}

function useUrgentCount() {
  const { reminders } = useData();
  const now = useNow();
  return reminders.filter((reminder) => {
    const status = getReminderTimeStatus({ dueAt: reminder.dueAt, allDay: reminder.allDay, leadDays: reminder.leadDays, now });
    return status === "overdue" || status === "today";
  }).length;
}

function guardedClick(event: React.MouseEvent) {
  if (!confirmLeave()) event.preventDefault();
}

export function AppHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useAuth();
  const urgent = useUrgentCount();
  const onMap = pathname === "/map";
  const focus = isFocusRoute(pathname);
  const initial = (user?.displayName || user?.email || "?").trim().charAt(0).toUpperCase();

  function back() {
    if (!confirmLeave()) return;
    if (window.history.length > 1) router.back();
    else router.push(pathname.startsWith("/templates") ? "/templates" : "/map");
  }

  return (
    <header className="relative z-30 shrink-0 border-b border-line bg-white/95 pt-safe backdrop-blur">
      <div className="flex h-14 items-center gap-2 px-3 lg:gap-4 lg:px-4">
        {focus ? (
          <button type="button" className="btn btn-ghost btn-icon lg:hidden" aria-label="뒤로" onClick={back}>
            <ArrowLeft aria-hidden="true" />
          </button>
        ) : null}
        <Link href="/map" className={clsx("shrink-0 items-center gap-2", onMap ? "hidden lg:flex" : "flex")} onClick={guardedClick}>
          <span className="grid size-8 place-items-center rounded-[10px] bg-primary text-white">
            <MapPinned className="size-[18px]" aria-hidden="true" />
          </span>
          <span className="whitespace-nowrap text-[17px] font-bold tracking-tight">{APP_NAME}</span>
        </Link>
        {onMap ? <MapSearch /> : <div className="flex-1" />}
        <nav className="hidden items-center gap-1 lg:flex" aria-label="주요 메뉴">
          {LINKS.map((link) => {
            const active = pathname.startsWith(link.href);
            const Icon = link.icon;
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={clsx("btn btn-sm relative gap-1.5", active ? "bg-primary-soft text-primary-ink" : "btn-ghost text-muted")}
                onClick={guardedClick}
              >
                <Icon aria-hidden="true" />
                {link.label}
                {link.href === "/notifications" && urgent > 0 ? <span className="badge badge-danger ml-0.5 min-h-5 px-1.5">{urgent}</span> : null}
              </Link>
            );
          })}
        </nav>
        {focus ? (
          <Link href="/notifications" className="btn btn-ghost btn-icon relative lg:hidden" aria-label={urgent ? `알림, 오늘 또는 지연 ${urgent}건` : "알림"} onClick={guardedClick}>
            <Bell aria-hidden="true" />
            {urgent > 0 ? <span className="absolute right-1 top-1 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-danger px-1 text-[11px] font-bold text-white">{urgent}</span> : null}
          </Link>
        ) : null}
        <DropdownMenu.Root>
          <DropdownMenu.Trigger className="grid size-9 shrink-0 place-items-center rounded-full bg-[#1f2a44] text-sm font-bold text-white" aria-label="내 계정">
            {initial}
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content className="menu" align="end" sideOffset={6}>
              <div className="px-3 pb-2 pt-1.5">
                <p className="text-sm font-semibold">{user?.displayName || "내 계정"}</p>
                <p className="text-xs text-subtle">{user?.email}</p>
              </div>
              <DropdownMenu.Separator className="my-1 h-px bg-line" />
              <DropdownMenu.Item className="menu-item" onSelect={() => { if (confirmLeave()) router.push("/settings"); }}><Settings aria-hidden="true" />설정</DropdownMenu.Item>
              <DropdownMenu.Item className="menu-item" onSelect={() => logout()}><LogOut aria-hidden="true" />로그아웃</DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>
      {firebaseMode() === "emulator" ? <p className="border-t border-line bg-[#fffbeb] px-3 py-1 text-xs text-[#92400e]">로컬 Firebase 에뮬레이터에 연결되어 있습니다.</p> : null}
    </header>
  );
}

export function BottomNav() {
  const pathname = usePathname();
  const urgent = useUrgentCount();
  if (isFocusRoute(pathname)) return null;
  return (
    <nav className="z-30 grid shrink-0 grid-cols-4 border-t border-line bg-white pb-[env(safe-area-inset-bottom)] lg:hidden" aria-label="주요 메뉴">
      {LINKS.map((link) => {
        const active = pathname.startsWith(link.href);
        const Icon = link.icon;
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
            className={clsx("relative flex h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold", active ? "text-primary" : "text-subtle")}
            onClick={guardedClick}
          >
            <Icon className="size-[22px]" strokeWidth={active ? 2.4 : 2} aria-hidden="true" />
            {link.label}
            {link.href === "/notifications" && urgent > 0 ? <span className="absolute left-1/2 top-1.5 ml-1.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-danger px-1 text-[11px] font-bold text-white">{urgent}</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}
