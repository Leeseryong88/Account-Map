"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AUTH_ERROR_TEXT, signInWithGoogle, useAuth } from "@/lib/auth";
import { firebaseMode } from "@/lib/firebase";
import { AuthShell } from "@/components/AuthShell";

function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" className="size-5" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 8 3.1l5.7-5.7C34.2 6.1 29.4 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.2-.1-2.3-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19 12 24 12c3.1 0 5.8 1.2 8 3.1l5.7-5.7C34.2 6.1 29.4 4 24 4 16.3 4 9.6 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 10-2 13.6-5.2l-6.3-5.3C29.2 35.1 26.7 36 24 36c-5.3 0-9.7-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-1.1 3.2-3.5 5.7-6.6 7.2l6.3 5.3C37.4 38.3 44 33 44 24c0-1.2-.1-2.3-.4-3.5z" />
    </svg>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const { user, loading, configured } = useAuth();
  const [formError, setFormError] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!loading && user) router.replace("/map");
  }, [loading, user, router]);

  async function signIn() {
    setPending(true);
    setFormError("");
    try {
      await signInWithGoogle();
      router.replace("/map");
    } catch (error) {
      const code = typeof error === "object" && error && "code" in error ? String((error as { code: string }).code) : "";
      if (code !== "auth/popup-closed-by-user") setFormError(AUTH_ERROR_TEXT[code] ?? "Google 로그인에 실패했습니다.");
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthShell
      title="시작하기"
      description="Google 계정으로 로그인하면 거래처와 방문 기록을 이어서 관리할 수 있습니다. 처음이면 계정이 만들어집니다."
    >
      {firebaseMode() === "emulator" ? <p className="mb-4 rounded-lg bg-warn-soft px-3 py-2 text-[13px] text-warn">로컬 에뮬레이터 모드입니다. 인증 에뮬레이터가 켜져 있어야 합니다.</p> : null}
      {!configured ? <p role="alert" className="mb-4 text-sm text-danger">Firebase 설정이 없습니다.</p> : null}
      {formError ? <p role="alert" className="mb-4 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{formError}</p> : null}
      <button type="button" className="btn btn-secondary h-12 w-full text-base" disabled={pending || !configured} aria-busy={pending} onClick={() => void signIn()}>
        <GoogleMark />
        {pending ? "Google 연결 중" : "Google로 계속하기"}
      </button>
      <p className="mt-4 text-center text-[13px] leading-5 text-subtle">처음 로그인하면 기본 방문 기록 템플릿이 준비됩니다.</p>
    </AuthShell>
  );
}
