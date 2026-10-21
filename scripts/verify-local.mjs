import { initializeApp } from "firebase/app";
import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth } from "firebase/auth";
import { connectFirestoreEmulator, doc, getDoc, getFirestore, serverTimestamp, setDoc, writeBatch } from "firebase/firestore";
import { connectFunctionsEmulator, getFunctions, httpsCallable } from "firebase/functions";

const app = initializeApp({
  apiKey: "demo-api-key",
  authDomain: "demo-salesmap.firebaseapp.com",
  projectId: "demo-salesmap",
  appId: "1:000000000000:web:demo",
});
const auth = getAuth(app);
const db = getFirestore(app);
const functions = getFunctions(app, "asia-northeast3");
connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
connectFirestoreEmulator(db, "127.0.0.1", 8080);
connectFunctionsEmulator(functions, "127.0.0.1", 5001);

const stamp = Date.now().toString(36);
const email = `sales.${stamp}@example.com`;
const user = (await createUserWithEmailAndPassword(auth, email, "password123")).user;
const uid = user.uid;

await setDoc(doc(db, `users/${uid}`), {
  email,
  displayName: "검증",
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
});
await setDoc(doc(db, `users/${uid}/settings/preferences`), {
  recentDays: 7,
  normalDays: 30,
  warningDays: 60,
  updatedAt: serverTimestamp(),
});

const templateId = `t${stamp}`;
const version1 = `ver1${stamp}`;
const version2 = `ver2${stamp}`;
const rule = { enabled: true, daysAfterVisit: 14, leadDays: 3 };
const purpose = {
  id: "purpose",
  type: "single",
  label: "방문 목적",
  required: true,
  helpText: "",
  placeholder: "",
  options: [
    { id: "new", label: "신규 상담" },
    { id: "regular", label: "정기 방문" },
  ],
  unit: "",
  reminderRule: null,
};
const followUp = {
  id: "follow_up_date",
  type: "date",
  label: "후속 연락일",
  required: false,
  helpText: "",
  placeholder: "",
  options: [],
  unit: "",
  reminderRule: { enabled: true, title: "후속 연락", leadDays: 1 },
};
const batch = writeBatch(db);
batch.set(doc(db, `users/${uid}/templates/${templateId}`), {
  name: "기본 영업 방문",
  description: "검증",
  archived: false,
  currentVersionId: version1,
  currentVersionNumber: 1,
  revisitRule: rule,
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
});
batch.set(doc(db, `users/${uid}/templates/${templateId}/versions/${version1}`), {
  versionNumber: 1,
  name: "기본 영업 방문",
  description: "검증",
  fields: [purpose, followUp],
  revisitRule: rule,
  createdAt: serverTimestamp(),
});
await batch.commit();

const reordered = writeBatch(db);
reordered.set(doc(db, `users/${uid}/templates/${templateId}/versions/${version2}`), {
  versionNumber: 2,
  name: "기본 영업 방문",
  description: "검증",
  fields: [followUp, { ...purpose, label: "방문 이유" }],
  revisitRule: rule,
  createdAt: serverTimestamp(),
});
reordered.update(doc(db, `users/${uid}/templates/${templateId}`), {
  currentVersionId: version2,
  currentVersionNumber: 2,
  updatedAt: serverTimestamp(),
});
await reordered.commit();
const oldVersion = await getDoc(doc(db, `users/${uid}/templates/${templateId}/versions/${version1}`));
if (oldVersion.data().fields[0].label !== "방문 목적") throw new Error("과거 템플릿 버전이 바뀌었습니다.");

const accountId = `a${stamp}`;
await setDoc(doc(db, `users/${uid}/accounts/${accountId}`), {
  name: "한빛상점",
  address: "서울시 중구",
  lat: 37.5665,
  lng: 126.978,
  industry: "유통",
  phone: "021234567",
  tags: ["병원"],
  memo: "",
  salesStatus: "prospect",
  archived: false,
  contactSearchText: "",
  primaryContactName: "",
  templateIds: [],
  defaultTemplateId: null,
  lastVisitAt: null,
  visitCount: 0,
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
});

async function addContact(id, name, primary) {
  await setDoc(doc(db, `users/${uid}/contacts/${id}`), {
    accountId,
    name,
    role: primary ? "실장" : "담당",
    department: "구매",
    phone: primary ? "01011112222" : "01033334444",
    email: "",
    memo: "",
    isPrimary: primary,
    active: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}
await addContact(`c1${stamp}`, "김담당", true);
await addContact(`c2${stamp}`, "이담당", false);
await import("firebase/firestore").then(({ updateDoc }) => updateDoc(doc(db, `users/${uid}/accounts/${accountId}`), {
  contactSearchText: "김담당 이담당",
  primaryContactName: "김담당",
  templateIds: [templateId],
  defaultTemplateId: templateId,
  updatedAt: serverTimestamp(),
}));
await setDoc(doc(db, `users/${uid}/accountTemplateLinks/${accountId}__${templateId}`), {
  accountId,
  templateId,
  createdAt: serverTimestamp(),
});

const today = new Date();
const kst = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(today);
const visitedAt = new Date(`${kst}T10:00:00+09:00`).toISOString();
const [y, m, d] = kst.split("-").map(Number);
const follow = new Date(Date.UTC(y, m - 1, d + 7));
const followYmd = `${follow.getUTCFullYear()}-${String(follow.getUTCMonth() + 1).padStart(2, "0")}-${String(follow.getUTCDate()).padStart(2, "0")}`;
const saveVisit = httpsCallable(functions, "saveVisit");
const saved = await saveVisit({
  clientRequestId: `req${stamp}`,
  visitId: null,
  accountId,
  visitedAt,
  summary: "첫 상담",
  contactIds: [`c1${stamp}`, `c2${stamp}`],
  templateId,
  answers: { purpose: "regular", follow_up_date: followYmd },
});
const again = await saveVisit({
  clientRequestId: `req${stamp}`,
  visitId: null,
  accountId,
  visitedAt,
  summary: "첫 상담",
  contactIds: [`c1${stamp}`, `c2${stamp}`],
  templateId,
  answers: { purpose: "regular", follow_up_date: followYmd },
});
if (!again.data.alreadyApplied) throw new Error("재시도가 중복 저장으로 처리되지 않았습니다.");
const account = await getDoc(doc(db, `users/${uid}/accounts/${accountId}`));
if (account.data().visitCount !== 1) throw new Error(`방문 횟수 ${account.data().visitCount}`);
const visit = await getDoc(doc(db, `users/${uid}/visits/${saved.data.visitId}`));
if (visit.data().formSnapshot.fields[0].label !== "후속 연락일") throw new Error("최신 양식 스냅샷이 아닙니다.");
if (visit.data().contacts.length !== 2) throw new Error("담당자 스냅샷이 없습니다.");
console.log(JSON.stringify({ email, visitId: saved.data.visitId, visitCount: account.data().visitCount, changes: saved.data.changes.map((change) => change.action + ":" + change.type) }));
process.exit(0);
