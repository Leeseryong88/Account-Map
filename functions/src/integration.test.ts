import { beforeAll, describe, expect, it } from "vitest";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { addSeoulDays, formatDateInSeoul } from "../../shared/src/dates";
import { fieldReminderDocId, revisitDocId, visitDocId } from "../../shared/src/ids";
import type { TemplateField } from "../../shared/src/types";
import { handleSetAccountArchived } from "./archiveAccount";
import { handleDeleteVisit } from "./deleteVisit";
import { handleCreateManualReminder, handleUpdateReminder } from "./reminders";
import { handleSaveVisit } from "./saveVisit";

const followUp: TemplateField = {
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

function day(offset: number) {
  const [year, month, date] = formatDateInSeoul(new Date()).split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, date + offset));
  const ymd = `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}-${String(shifted.getUTCDate()).padStart(2, "0")}`;
  return { ymd, iso: new Date(`${ymd}T12:00:00+09:00`).toISOString() };
}

beforeAll(() => {
  if (!getApps().length) initializeApp({ projectId: process.env.GCLOUD_PROJECT || "demo-salesmap" });
});

async function seed(uid: string) {
  const db = getFirestore();
  const rule = { enabled: true, daysAfterVisit: 14, leadDays: 3 };
  await db.doc(`users/${uid}/accounts/acc1`).set({ name: "한빛상점", visitCount: 0, lastVisitAt: null });
  await db.doc(`users/${uid}/templates/tpl1`).set({
    name: "기본 영업 방문",
    archived: false,
    currentVersionId: "ver1",
    revisitRule: rule,
  });
  await db.doc(`users/${uid}/templates/tpl1/versions/ver1`).set({
    versionNumber: 1,
    name: "기본 영업 방문",
    description: "",
    fields: [followUp],
    revisitRule: rule,
  });
}

function visitInput(uid: string, request: string, when: string, followUpDate: string | null, visitId: string | null = null) {
  return {
    clientRequestId: request,
    visitId,
    accountId: "acc1",
    visitedAt: when,
    summary: `기록 ${request}`,
    contactIds: [] as string[],
    templateId: visitId ? null : "tpl1",
    answers: followUpDate ? { follow_up_date: followUpDate } : {},
  };
}

describe("방문 저장과 알림", () => {
  it("재시도해도 방문과 알림이 중복되지 않는다", async () => {
    const uid = "idem";
    await seed(uid);
    const today = day(0);
    const input = visitInput(uid, "reqonce", today.iso, addSeoulDays(today.iso, 7));
    const first = await handleSaveVisit(uid, input);
    const second = await handleSaveVisit(uid, input);
    expect(second.alreadyApplied).toBe(true);
    expect(second.visitId).toBe(first.visitId);
    const db = getFirestore();
    const visits = await db.collection(`users/${uid}/visits`).get();
    const reminders = await db.collection(`users/${uid}/reminders`).get();
    expect(visits.size).toBe(1);
    expect(reminders.size).toBe(2);
    expect((await db.doc(`users/${uid}/accounts/acc1`).get()).get("visitCount")).toBe(1);
  });

  it("과거 방문은 최근 방문일을 유지하고 새 방문은 재방문을 갱신하며 기존 후속 업무는 남긴다", async () => {
    const uid = "timeline";
    await seed(uid);
    const db = getFirestore();
    const older = day(-40);
    const yesterday = day(-1);
    const today = day(0);
    const first = await handleSaveVisit(uid, visitInput(uid, "reqy", yesterday.iso, addSeoulDays(yesterday.iso, 6)));
    const manual = await handleCreateManualReminder(uid, {
      clientRequestId: "reqmanual",
      accountId: "acc1",
      title: "견적 확인",
      dueAt: new Date(`${addSeoulDays(today.iso, 3)}T00:00:00+09:00`).toISOString(),
      allDay: true,
      leadDays: 1,
      memo: "",
    });
    await handleSaveVisit(uid, visitInput(uid, "reqold", older.iso, null));
    const afterPast = await db.doc(`users/${uid}/accounts/acc1`).get();
    expect(formatDateInSeoul(afterPast.get("lastVisitAt").toDate())).toBe(yesterday.ymd);
    expect(afterPast.get("visitCount")).toBe(2);
    const revisit = await db.doc(`users/${uid}/reminders/${revisitDocId("reqy")}`).get();
    expect(formatDateInSeoul(revisit.get("dueAt").toDate())).toBe(addSeoulDays(yesterday.iso, 14));
    const field = await db.doc(`users/${uid}/reminders/${fieldReminderDocId(first.visitId, "follow_up_date")}`).get();
    expect(field.get("status")).toBe("open");

    await handleSaveVisit(uid, visitInput(uid, "reqtoday", today.iso, null));
    const afterToday = await db.doc(`users/${uid}/accounts/acc1`).get();
    expect(formatDateInSeoul(afterToday.get("lastVisitAt").toDate())).toBe(today.ymd);
    expect(formatDateInSeoul((await revisit.ref.get()).get("dueAt").toDate())).toBe(addSeoulDays(today.iso, 14));
    expect((await field.ref.get()).get("status")).toBe("open");
    expect((await db.doc(`users/${uid}/reminders/${manual.reminderId}`).get()).get("status")).toBe("open");
  });

  it("완료한 재방문은 과거 방문으로 되살아나지 않고 더 새로운 방문에서만 새 회차가 생긴다", async () => {
    const uid = "cycle";
    await seed(uid);
    const db = getFirestore();
    const yesterday = day(-1);
    const older = day(-30);
    const today = day(0);
    await handleSaveVisit(uid, visitInput(uid, "reqbase", yesterday.iso, null));
    await handleUpdateReminder(uid, { reminderId: revisitDocId("reqbase"), action: "complete" });
    await handleSaveVisit(uid, visitInput(uid, "reqpast", older.iso, null));
    const openAfterPast = (await db.collection(`users/${uid}/reminders`).get()).docs.filter((doc) => doc.get("type") === "revisit" && doc.get("status") === "open");
    expect(openAfterPast.length).toBe(0);
    expect((await db.doc(`users/${uid}/reminders/${revisitDocId("reqbase")}`).get()).get("status")).toBe("done");
    await handleSaveVisit(uid, visitInput(uid, "reqnext", today.iso, null));
    const openAfterNext = (await db.collection(`users/${uid}/reminders`).get()).docs.filter((doc) => doc.get("type") === "revisit" && doc.get("status") === "open");
    expect(openAfterNext.length).toBe(1);
    expect(formatDateInSeoul(openAfterNext[0].get("dueAt").toDate())).toBe(addSeoulDays(today.iso, 14));
  });

  it("템플릿을 고쳐도 과거 기록은 당시 양식을 유지한다", async () => {
    const uid = "version";
    await seed(uid);
    const db = getFirestore();
    const yesterday = day(-1);
    const saved = await handleSaveVisit(uid, visitInput(uid, "reqform", yesterday.iso, addSeoulDays(yesterday.iso, 4)));
    const requiredField: TemplateField = { ...followUp, id: "follow_up_date", label: "다음 연락", required: true };
    await db.doc(`users/${uid}/templates/tpl1/versions/ver2`).set({
      versionNumber: 2,
      name: "기본 영업 방문",
      description: "",
      fields: [requiredField],
      revisitRule: { enabled: true, daysAfterVisit: 14, leadDays: 3 },
    });
    await db.doc(`users/${uid}/templates/tpl1`).update({ currentVersionId: "ver2", currentVersionNumber: 2 });
    const oldVisit = await db.doc(`users/${uid}/visits/${saved.visitId}`).get();
    expect(oldVisit.get("formSnapshot").fields[0].label).toBe("후속 연락일");
    await handleSaveVisit(uid, visitInput(uid, "reqedit", yesterday.iso, addSeoulDays(yesterday.iso, 4), saved.visitId));
    expect((await oldVisit.ref.get()).get("formSnapshot").fields[0].label).toBe("후속 연락일");
    await expect(handleSaveVisit(uid, visitInput(uid, "reqnew", day(0).iso, null))).rejects.toThrow(/필수/);
  });

  it("기록을 삭제하면 방문 횟수와 재방문 기준이 남은 기록에 맞는다", async () => {
    const uid = "remove";
    await seed(uid);
    const db = getFirestore();
    const yesterday = day(-1);
    const today = day(0);
    const first = await handleSaveVisit(uid, visitInput(uid, "reqkeep", yesterday.iso, addSeoulDays(yesterday.iso, 5)));
    const latest = await handleSaveVisit(uid, visitInput(uid, "reqdrop", today.iso, addSeoulDays(today.iso, 2)));
    await handleDeleteVisit(uid, { clientRequestId: "reqdelete", visitId: latest.visitId, cancelLinkedFieldReminders: true });
    const account = await db.doc(`users/${uid}/accounts/acc1`).get();
    expect(account.get("visitCount")).toBe(1);
    expect(formatDateInSeoul(account.get("lastVisitAt").toDate())).toBe(yesterday.ymd);
    expect((await db.doc(`users/${uid}/reminders/${fieldReminderDocId(latest.visitId, "follow_up_date")}`).get()).get("status")).toBe("cancelled");
    expect((await db.doc(`users/${uid}/reminders/${fieldReminderDocId(first.visitId, "follow_up_date")}`).get()).get("status")).toBe("open");
    expect(formatDateInSeoul((await db.doc(`users/${uid}/reminders/${revisitDocId("reqkeep")}`).get()).get("dueAt").toDate())).toBe(addSeoulDays(yesterday.iso, 14));
    const again = await handleDeleteVisit(uid, { clientRequestId: "reqdelete", visitId: latest.visitId, cancelLinkedFieldReminders: true });
    expect(again.alreadyApplied).toBe(true);
    expect((await account.ref.get()).get("visitCount")).toBe(1);
  });

  it("다른 사용자 경로에는 기록을 만들지 않는다", async () => {
    const db = getFirestore();
    await db.doc("users/bob/accounts/secret").set({ name: "비밀", visitCount: 9, lastVisitAt: null });
    await expect(
      handleSaveVisit("alice", {
        clientRequestId: "reqcross",
        visitId: null,
        accountId: "secret",
        visitedAt: day(0).iso,
        summary: "침범",
        contactIds: [],
        templateId: null,
        answers: {},
      }),
    ).rejects.toThrow(/거래처/);
    expect((await db.collection("users/alice/visits").get()).size).toBe(0);
    expect((await db.doc("users/bob/accounts/secret").get()).get("visitCount")).toBe(9);
  });

  it("보관하면서 미완료 알림을 취소할 수 있다", async () => {
    const uid = "archive";
    await seed(uid);
    const db = getFirestore();
    await handleSaveVisit(uid, visitInput(uid, "reqarch", day(0).iso, addSeoulDays(day(0).iso, 3)));
    await handleSetAccountArchived(uid, { accountId: "acc1", archived: true, cancelOpenReminders: true });
    expect((await db.doc(`users/${uid}/accounts/acc1`).get()).get("archived")).toBe(true);
    const open = await db.collection(`users/${uid}/reminders`).where("status", "==", "open").get();
    expect(open.size).toBe(0);
  });
});

describe("요청 번호", () => {
  it("같은 요청 번호는 같은 방문 ID가 된다", () => {
    expect(visitDocId("reqabc")).toBe("vreqabc");
  });
});
