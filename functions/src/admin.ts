import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, type Firestore, Timestamp } from "firebase-admin/firestore";

export function ensureAdmin(): Firestore {
  if (!getApps().length) initializeApp();
  return getFirestore();
}

export function asIso(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (typeof value === "object" && value && "toDate" in value && typeof value.toDate === "function") {
    return value.toDate().toISOString();
  }
  if (typeof value === "string") return new Date(value).toISOString();
  return null;
}
