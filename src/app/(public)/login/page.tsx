"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { z } from "zod";
import { AUTH_ERROR_TEXT, useAuth } from "@/lib/auth";
import { firebaseMode, getFirebase } from "@/lib/firebase";
import { AuthShell } from "@/components/AuthShell";
import { Button, Field, TextInput } from "@/components/ui";

const schema = z.object({
  email: z.string().trim().email("이메일 형식을 확인해 주세요."),
  password: z.string().min(1, "비밀번호를 입력해 주세요."),
});

export default function LoginPage() {
  const router = useRouter();
  const { user, loading, configured } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!loading && user) router.replace("/map");
  }, [loading, user, router]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const parsed = schema.safeParse({ email, password });
    if (!parsed.success) {
      const next: Record<string, string> = {};
      parsed.error.issues.forEach((issue) => { next[String(issue.path[0])] = issue.message; });
      setErrors(next);
      return;
    }
    setErrors({});
    setPending(true);
    setFormError("");
    try {
      await signInWithEmailAndPassword(getFirebase().auth, parsed.data.email, parsed.data.password);
      router.replace("/map");
    } catch (error) {
      const code = typeof error === "object" && error && "code" in error ? String((error as { code: string }).code) : "";
      setFormError(AUTH_ERROR_TEXT[code] ?? "로그인하지 못했습니다.");
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthShell
      title="로그인"
      description="내 거래처와 방문 기록을 이어서 관리하세요."
      footer={<>처음이신가요? <Link href="/signup" className="font-semibold text-primary hover:underline">회원가입</Link></>}
    >
      {firebaseMode() === "emulator" ? <p className="mb-4 rounded-lg bg-warn-soft px-3 py-2 text-[13px] text-warn">로컬 에뮬레이터 모드입니다. 인증 에뮬레이터가 켜져 있어야 합니다.</p> : null}
      {!configured ? <p role="alert" className="mb-4 text-sm text-danger">Firebase 설정이 없습니다.</p> : null}
      <form className="grid gap-4" onSubmit={onSubmit} noValidate>
        {formError ? <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{formError}</p> : null}
        <Field id="email" label="이메일" error={errors.email}>
          {(aria) => <TextInput {...aria} type="email" autoComplete="username" inputMode="email" placeholder="name@company.com" value={email} onChange={(event) => setEmail(event.target.value)} />}
        </Field>
        <Field id="password" label="비밀번호" error={errors.password}>
          {(aria) => <TextInput {...aria} type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} />}
        </Field>
        <Button type="submit" variant="primary" className="mt-1 h-12 text-base" disabled={pending} aria-busy={pending}>{pending ? "로그인 중" : "로그인"}</Button>
      </form>
    </AuthShell>
  );
}
