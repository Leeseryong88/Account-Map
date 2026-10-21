"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { MapPinned } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { DataProvider } from "@/lib/data";
import { MapUiProvider } from "@/lib/mapUi";
import { AppHeader, BottomNav } from "@/components/AppHeader";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, configured, profileError } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  if (!configured) {
    return <p className="p-6">Firebase 환경 변수가 없습니다. `.env.example`을 `.env.local`로 복사한 뒤 값을 채워 주세요.</p>;
  }
  if (loading || !user) {
    return (
      <div className="grid h-dvh place-items-center bg-bg">
        <div className="grid justify-items-center gap-3 text-subtle">
          <span className="grid size-12 animate-pulse place-items-center rounded-2xl bg-primary text-white">
            <MapPinned className="size-6" aria-hidden="true" />
          </span>
          <p className="text-sm">불러오는 중</p>
        </div>
      </div>
    );
  }

  return (
    <DataProvider uid={user.uid}>
      <MapUiProvider uid={user.uid}>
        <div className="flex h-dvh flex-col">
          <a href="#main" className="skip-link">본문으로 건너뛰기</a>
          <AppHeader />
          {profileError ? <p role="alert" className="bg-warn-soft px-3 py-2 text-sm text-warn">{profileError}</p> : null}
          <main id="main" className="min-h-0 flex-1 overflow-hidden">{children}</main>
          <BottomNav />
        </div>
      </MapUiProvider>
    </DataProvider>
  );
}
