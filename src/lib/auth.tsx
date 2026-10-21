"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut, type User } from "firebase/auth";
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

export async function signInWithGoogle() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  return signInWithPopup(getFirebase().auth, provider);
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
          setState((current) => ({ ...current, profileError: "사용자 기본 정보를 만들지 못했습니다. 잠시 후 다시 로그인해 주세요." }));
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
  "auth/popup-closed-by-user": "로그인을 취소했습니다.",
  "auth/cancelled-popup-request": "로그인이 중단되었습니다. 다시 시도해 주세요.",
  "auth/popup-blocked": "브라우저가 로그인 창을 막았습니다. 팝업을 허용해 주세요.",
  "auth/unauthorized-domain": "이 주소는 Firebase 로그인에 등록되어 있지 않습니다.",
  "auth/account-exists-with-different-credential": "이 Google 계정 이메일은 다른 로그인 방식으로 이미 있습니다.",
  "auth/too-many-requests": "시도가 많습니다. 잠시 후 다시 로그인해 주세요.",
  "auth/network-request-failed": "인증 서버에 연결하지 못했습니다.",
};
