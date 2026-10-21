"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { collection, doc, limit, onSnapshot, orderBy, query, serverTimestamp, setDoc, where } from "firebase/firestore";
import { DEFAULT_BANDS, LIMITS, type VisitBands } from "@shared/types";
import { validateBands } from "@shared/visitBands";
import { getFirebase } from "./firebase";
import { ensureDefaultTemplate } from "./writes";
import { accountFromDoc, reminderFromDoc, templateFromDoc, type AccountRecord, type ReminderRecord, type TemplateRecord } from "./records";

interface DataState {
  accounts: AccountRecord[];
  reminders: ReminderRecord[];
  templates: TemplateRecord[];
  bands: VisitBands;
  accountsCapped: boolean;
  remindersCapped: boolean;
  templatesCapped: boolean;
  loading: boolean;
  templatesLoading: boolean;
  error: string | null;
  saveBands: (bands: VisitBands) => Promise<void>;
}

const DataContext = createContext<DataState | null>(null);

export function useData() {
  const value = useContext(DataContext);
  if (!value) throw new Error("데이터 컨텍스트가 없습니다.");
  return value;
}

export function DataProvider({ uid, children }: { uid: string; children: React.ReactNode }) {
  const [accounts, setAccounts] = useState<AccountRecord[]>([]);
  const [reminders, setReminders] = useState<ReminderRecord[]>([]);
  const [templates, setTemplates] = useState<TemplateRecord[]>([]);
  const [bands, setBands] = useState<VisitBands>(DEFAULT_BANDS);
  const [accountsCapped, setAccountsCapped] = useState(false);
  const [remindersCapped, setRemindersCapped] = useState(false);
  const [templatesCapped, setTemplatesCapped] = useState(false);
  const [loading, setLoading] = useState(true);
  const [templatesLoading, setTemplatesLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const db = getFirebase().db;
    const unsubAccounts = onSnapshot(
      query(collection(db, `users/${uid}/accounts`), orderBy("name"), limit(LIMITS.accounts)),
      (snap) => {
        setAccounts(snap.docs.map((item) => accountFromDoc(item.id, item.data())));
        setAccountsCapped(snap.size >= LIMITS.accounts);
        setLoading(false);
        setError(null);
      },
      () => setError("거래처를 불러오지 못했습니다."),
    );
    const unsubReminders = onSnapshot(
      query(collection(db, `users/${uid}/reminders`), where("status", "==", "open"), orderBy("dueAt"), limit(LIMITS.openReminders)),
      (snap) => {
        setReminders(snap.docs.flatMap((item) => {
          const reminder = reminderFromDoc(item.id, item.data());
          return reminder ? [reminder] : [];
        }));
        setRemindersCapped(snap.size >= LIMITS.openReminders);
      },
      () => setError("알림을 불러오지 못했습니다. Firestore 인덱스가 배포됐는지 확인해 주세요."),
    );
    let provisioned = false;
    const unsubTemplates = onSnapshot(query(collection(db, `users/${uid}/templates`), limit(LIMITS.templates)), { includeMetadataChanges: true }, (snap) => {
      setTemplates(snap.docs.map((item) => templateFromDoc(item.id, item.data())));
      setTemplatesCapped(snap.size >= LIMITS.templates);
      if (snap.metadata.fromCache) return;
      setTemplatesLoading(false);
      if (snap.empty && !provisioned) {
        provisioned = true;
        void ensureDefaultTemplate(uid).catch(() => undefined);
      }
    }, () => setTemplatesLoading(false));
    const unsubSettings = onSnapshot(doc(db, `users/${uid}/settings/preferences`), (snap) => {
      if (!snap.exists()) return;
      const next = {
        recentDays: snap.get("recentDays"),
        normalDays: snap.get("normalDays"),
        warningDays: snap.get("warningDays"),
      };
      if (!validateBands(next)) setBands(next);
    });
    return () => {
      unsubAccounts();
      unsubReminders();
      unsubTemplates();
      unsubSettings();
    };
  }, [uid]);

  const value = useMemo<DataState>(() => ({
    accounts,
    reminders,
    templates,
    bands,
    accountsCapped,
    remindersCapped,
    templatesCapped,
    loading,
    templatesLoading,
    error,
    saveBands: async (next) => {
      const message = validateBands(next);
      if (message) throw new Error(message);
      const ref = doc(getFirebase().db, `users/${uid}/settings/preferences`);
      await setDoc(ref, { ...next, updatedAt: serverTimestamp() });
      setBands(next);
    },
  }), [accounts, reminders, templates, bands, accountsCapped, remindersCapped, templatesCapped, loading, templatesLoading, error, uid]);

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}
