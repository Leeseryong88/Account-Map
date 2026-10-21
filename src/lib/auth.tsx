"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { DEFAULT_BANDS } from "@shared/types";
import { firebaseMode, getFirebase } from "./firebase";

interface AuthState {
  user: User | null;
  loading: boolean;
  configured: boolean;
  profileError: string | null;
}

const AuthContext = createContext<AuthState>({ user: null, loading: true, configured: true, profileError: null });

export function useAuth() {
  return useContext(AuthContext);
}

async function ensureProfile(user: User) {
  const db = getFirebase().db;
  const userRef = doc(db, `users/${user.uid}`);
  const existing = await getDoc(userRef);
  if (!existing.exists()) {
    await setDoc(userRef, {
      email: user.email ?? "",
      displayName: user.displayName ?? user.email?.split("@")[0] ?? "사용자",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }
  const settingsRef = doc(db, `users/${user.uid}/settings/preferences`);
  const settings = await getDoc(settingsRef);
  if (!settings.exists()) {
    await setDoc(settingsRef, { ...DEFAULT_BANDS, updatedAt: serverTimestamp() });
  }
}

export function clearLocalSalesData() {
  const localKeys: string[] = [];
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (key?.startsWith("salesmap:")) localKeys.push(key);
  }
  localKeys.forEach((key) => localStorage.removeItem(key));
  sessionStorage.clear();
}

export async function logout() {
  clearLocalSalesData();
  await signOut(getFirebase().auth);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    loading: true,
    configured: firebaseMode() !== "unconfigured",
    profileError: null,
  });

  useEffect(() => {
    if (firebaseMode() === "unconfigured") {
      setState({ user: null, loading: false, configured: false, profileError: null });
      return;
    }
    let unsubscribe = () => {};
    try {
      unsubscribe = onAuthStateChanged(getFirebase().auth, (user) => {
        setState((current) => ({ ...current, user, loading: false, configured: true }));
        if (!user) return;
        ensureProfile(user).catch(() => {
          setState((current) => ({ ...current, profileError: "사용자 기본 정보를 만들지 못했습니다. 에뮬레이터 연결을 확인해 주세요." }));
        });
      });
    } catch (error) {
      setState({
        user: null,
        loading: false,
        configured: false,
        profileError: error instanceof Error ? error.message : "Firebase를 시작하지 못했습니다.",
      });
    }
    return unsubscribe;
  }, []);

  const value = useMemo(() => state, [state]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const AUTH_ERROR_TEXT: Record<string, string> = {
  "auth/email-already-in-use": "이미 가입한 이메일입니다.",
  "auth/invalid-email": "이메일 형식을 확인해 주세요.",
  "auth/weak-password": "비밀번호는 8자 이상이어야 합니다.",
  "auth/invalid-credential": "이메일 또는 비밀번호가 맞지 않습니다.",
  "auth/wrong-password": "이메일 또는 비밀번호가 맞지 않습니다.",
  "auth/user-not-found": "이메일 또는 비밀번호가 맞지 않습니다.",
  "auth/too-many-requests": "시도가 많습니다. 잠시 후 다시 로그인해 주세요.",
  "auth/network-request-failed": "인증 서버에 연결하지 못했습니다. 에뮬레이터가 실행 중인지 확인해 주세요.",
};
