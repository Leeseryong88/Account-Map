"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { z } from "zod";
import { AUTH_ERROR_TEXT, useAuth } from "@/lib/auth";
import { getFirebase } from "@/lib/firebase";
import { AuthShell } from "@/components/AuthShell";
import { Button, Field, TextInput } from "@/components/ui";

const schema = z.object({
  displayName: z.string().trim().max(80),
  email: z.string().trim().email("이메일 형식을 확인해 주세요."),
  password: z.string().min(8, "비밀번호는 8자 이상이어야 합니다."),
  confirm: z.string(),
}).superRefine((value, ctx) => {
  if (value.password !== value.confirm) ctx.addIssue({ code: "custom", path: ["confirm"], message: "비밀번호가 서로 다릅니다." });
});

export default function SignupPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [form, setForm] = useState({ displayName: "", email: "", password: "", confirm: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [pending, setPending] = useState(false);
  useEffect(() => {
    if (!loading && user) router.replace("/map");
  }, [loading, user, router]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const parsed = schema.safeParse(form);
    if (!parsed.success) {
      const next: Record<string, string> = {};
      parsed.error.issues.forEach((issue) => { next[String(issue.path[0])] = issue.message; });
      setErrors(next);
      return;
    }
    setPending(true);
    setFormError("");
    try {
      const credential = await createUserWithEmailAndPassword(getFirebase().auth, parsed.data.email, parsed.data.password);
      const name = parsed.data.displayName || parsed.data.email.split("@")[0];
      await updateProfile(credential.user, { displayName: name });
      router.replace("/map");
    } catch (error) {
      const code = typeof error === "object" && error && "code" in error ? String((error as { code: string }).code) : "";
      setFormError(AUTH_ERROR_TEXT[code] ?? "회원가입하지 못했습니다.");
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthShell
      title="회원가입"
      description="가입하면 기본 방문 기록 템플릿이 바로 준비됩니다."
      footer={<>이미 계정이 있으신가요? <Link href="/login" className="font-semibold text-primary hover:underline">로그인</Link></>}
    >
      <form className="grid gap-4" onSubmit={onSubmit} noValidate>
        {formError ? <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{formError}</p> : null}
        <Field id="displayName" label="이름" help="비워 두면 이메일 앞부분을 사용합니다.">
          {(aria) => <TextInput {...aria} autoComplete="name" value={form.displayName} onChange={(event) => setForm({ ...form, displayName: event.target.value })} />}
        </Field>
        <Field id="email" label="이메일" required error={errors.email}>
          {(aria) => <TextInput {...aria} type="email" autoComplete="email" inputMode="email" placeholder="name@company.com" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />}
        </Field>
        <Field id="password" label="비밀번호" required help="8자 이상" error={errors.password}>
          {(aria) => <TextInput {...aria} type="password" autoComplete="new-password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} />}
        </Field>
        <Field id="confirm" label="비밀번호 확인" required error={errors.confirm}>
          {(aria) => <TextInput {...aria} type="password" autoComplete="new-password" value={form.confirm} onChange={(event) => setForm({ ...form, confirm: event.target.value })} />}
        </Field>
        <Button type="submit" variant="primary" className="mt-1 h-12 text-base" disabled={pending} aria-busy={pending}>{pending ? "가입 중" : "가입하고 시작하기"}</Button>
      </form>
    </AuthShell>
  );
}
