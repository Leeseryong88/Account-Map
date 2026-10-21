import { readFileSync } from "node:fs";
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import { collection, doc, getDoc, getDocs, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";

let env: RulesTestEnvironment;

function account(extra: Record<string, unknown> = {}) {
  return {
    name: "테스트 영업처",
    address: "서울시 중구",
    lat: 37.56,
    lng: 126.97,
    industry: "유통",
    phone: "",
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
    ...extra,
  };
}

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-salesmap",
    firestore: {
      rules: readFileSync("firestore.rules", "utf8"),
      host: "127.0.0.1",
      port: 8080,
    },
  });
});

afterAll(async () => {
  await env.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
});

describe("사용자 데이터 격리", () => {
  it("다른 사용자의 영업처와 방문을 읽거나 쓰지 못한다", async () => {
    await env.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "users/bob/accounts/secret"), account({ name: "비밀 거래처" }));
      await setDoc(doc(context.firestore(), "users/bob/visits/v1"), { accountId: "secret", summary: "비밀" });
    });
    const alice = env.authenticatedContext("alice").firestore();
    await assertFails(getDoc(doc(alice, "users/bob/accounts/secret")));
    await assertFails(getDocs(collection(alice, "users/bob/accounts")));
    await assertFails(getDoc(doc(alice, "users/bob/visits/v1")));
    await assertFails(setDoc(doc(alice, "users/bob/accounts/copied"), account()));
    const stranger = env.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(stranger, "users/alice/accounts/a1")));
  });

  it("본인 영업처는 만들 수 있지만 방문 횟수와 방문 기록은 직접 바꿀 수 없다", async () => {
    const alice = env.authenticatedContext("alice").firestore();
    const ref = doc(alice, "users/alice/accounts/a1");
    await assertSucceeds(setDoc(ref, account()));
    await assertSucceeds(updateDoc(ref, { name: "변경된 영업처", updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(ref, { visitCount: 4 }));
    await assertFails(updateDoc(ref, { archived: true, updatedAt: serverTimestamp() }));
    await assertFails(setDoc(doc(alice, "users/alice/accounts/bad"), account({ visitCount: 3 })));
    await assertFails(setDoc(doc(alice, "users/alice/visits/v1"), { accountId: "a1", summary: "직접 기록" }));
  });

  it("템플릿 버전은 고칠 수 없고 알림은 읽음만 바꿀 수 있다", async () => {
    await env.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, "users/alice/templates/t1/versions/v1"), {
        versionNumber: 1,
        name: "기본",
        description: "",
        fields: [],
        revisitRule: { enabled: false, daysAfterVisit: 14, leadDays: 1 },
        createdAt: new Date(),
      });
      await setDoc(doc(db, "users/alice/reminders/r1"), {
        accountId: "a1",
        title: "후속 연락",
        status: "open",
        read: false,
        dueAt: new Date(),
      });
    });
    const alice = env.authenticatedContext("alice").firestore();
    await assertFails(updateDoc(doc(alice, "users/alice/templates/t1/versions/v1"), { name: "바꿔치기" }));
    await assertSucceeds(updateDoc(doc(alice, "users/alice/reminders/r1"), { read: true }));
    await assertFails(updateDoc(doc(alice, "users/alice/reminders/r1"), { read: true, title: "다른 일" }));
    await assertFails(setDoc(doc(alice, "users/alice/reminders/fake"), { title: "가짜", status: "open", read: false }));
    await assertFails(getDoc(doc(env.authenticatedContext("bob").firestore(), "users/alice/reminders/r1")));
  });
});
