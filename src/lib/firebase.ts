import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { connectAuthEmulator, getAuth, type Auth } from "firebase/auth";
import { connectFirestoreEmulator, getFirestore, type Firestore } from "firebase/firestore";
import { connectFunctionsEmulator, getFunctions, type Functions } from "firebase/functions";
import { FUNCTIONS_REGION } from "@shared/types";

export type FirebaseMode = "emulator" | "production" | "unconfigured";

export function firebaseMode(): FirebaseMode {
  if (process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === "true") return "emulator";
  if (!process.env.NEXT_PUBLIC_FIREBASE_API_KEY || !process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID) return "unconfigured";
  return "production";
}

const globalScope = globalThis as typeof globalThis & { __salesmapEmulator?: boolean };

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;
let functions: Functions | null = null;

export function getFirebase() {
  if (typeof window === "undefined") {
    throw new Error("Firebase 클라이언트는 브라우저에서만 초기화합니다.");
  }
  const mode = firebaseMode();
  if (mode === "unconfigured") {
    throw new Error("Firebase 환경 변수가 없습니다. .env.example을 확인해 주세요.");
  }
  if (!app) {
    app = getApps()[0] ?? initializeApp({
      apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "demo-api-key",
      authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "demo-salesmap.firebaseapp.com",
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "demo-salesmap",
      appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "1:000000000000:web:demo",
      messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "000000000000",
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    });
    auth = getAuth(app);
    db = getFirestore(app);
    functions = getFunctions(app, FUNCTIONS_REGION);
    if (mode === "emulator" && !globalScope.__salesmapEmulator) {
      connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
      connectFirestoreEmulator(db, "127.0.0.1", 8080);
      connectFunctionsEmulator(functions, "127.0.0.1", 5001);
      globalScope.__salesmapEmulator = true;
    }
  }
  return { app: app!, auth: auth!, db: db!, functions: functions! };
}

export function kakaoAppKey() {
  return process.env.NEXT_PUBLIC_KAKAO_MAP_KEY?.trim() ?? "";
}
