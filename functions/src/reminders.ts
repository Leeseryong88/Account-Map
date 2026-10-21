import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { ZodError } from "zod";
import { assertReminderDue } from "../../shared/src/dates";
import { manualReminderDocId, revisitStateId } from "../../shared/src/ids";
import { manualReminderSchema, updateReminderSchema } from "../../shared/src/schemas";
import { asIso, ensureAdmin } from "./admin";
import { AppError } from "./errors";

function zodMessage(error: unknown): string {
  if (error instanceof ZodError) return error.issues[0]?.message ?? "입력값을 확인해 주세요.";
  return "입력값을 확인해 주세요.";
}

export async function handleCreateManualReminder(uid: string, raw: unknown) {
  let input;
  try {
    input = manualReminderSchema.parse(raw);
  } catch (error) {
    throw new AppError("invalid-argument", zodMessage(error));
  }
  const db = ensureAdmin();
  let due: Date;
  try {
    due = assertReminderDue(input.dueAt);
  } catch (error) {
    throw new AppError("invalid-argument", error instanceof Error ? error.message : "알림 날짜를 확인해 주세요.");
  }
  const reminderId = manualReminderDocId(input.clientRequestId);
  return db.runTransaction(async (tx) => {
    const idemRef = db.doc(`users/${uid}/idempotency/${input.clientRequestId}`);
    const idemSnap = await tx.get(idemRef);
    if (idemSnap.exists) return idemSnap.get("result");
    const accountSnap = await tx.get(db.doc(`users/${uid}/accounts/${input.accountId}`));
    if (!accountSnap.exists) throw new AppError("not-found", "거래처를 찾을 수 없습니다.");
    const ref = db.doc(`users/${uid}/reminders/${reminderId}`);
    tx.set(ref, {
      accountId: input.accountId,
      accountName: String(accountSnap.get("name") ?? ""),
      type: "manual",
      title: input.title,
      memo: input.memo.trim(),
      dueAt: Timestamp.fromDate(due),
      allDay: input.allDay,
      leadDays: input.leadDays,
      status: "open",
      read: false,
      visitId: null,
      templateId: null,
      fieldId: null,
      sourceVisitAt: null,
      idempotencyKey: reminderId,
      completedAt: null,
      cancelledAt: null,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    const result = { reminderId, alreadyApplied: false };
    tx.set(idemRef, { op: "manualReminder", result, createdAt: FieldValue.serverTimestamp() });
    return result;
  });
}

export async function handleUpdateReminder(uid: string, raw: unknown) {
  let input;
  try {
    input = updateReminderSchema.parse(raw);
  } catch (error) {
    throw new AppError("invalid-argument", zodMessage(error));
  }
  const db = ensureAdmin();
  return db.runTransaction(async (tx) => {
    const ref = db.doc(`users/${uid}/reminders/${input.reminderId}`);
    const snap = await tx.get(ref);
    if (!snap.exists) throw new AppError("not-found", "알림을 찾을 수 없습니다.");
    if (snap.get("status") !== "open") throw new AppError("failed-precondition", "이미 마감된 알림입니다.");
    const templateId = (snap.get("templateId") as string | null) ?? null;
    const accountId = String(snap.get("accountId") ?? "");
    const stateRef = snap.get("type") === "revisit" && templateId ? db.doc(`users/${uid}/revisitStates/${revisitStateId(accountId, templateId)}`) : null;
    const stateSnap = stateRef ? await tx.get(stateRef) : null;

    if (input.action === "reschedule") {
      let due: Date;
      try {
        due = assertReminderDue(input.dueAt ?? "");
      } catch (error) {
        throw new AppError("invalid-argument", error instanceof Error ? error.message : "알림 날짜를 확인해 주세요.");
      }
      tx.update(ref, {
        dueAt: Timestamp.fromDate(due),
        allDay: input.allDay === true,
        leadDays: input.leadDays ?? Number(snap.get("leadDays") ?? 0),
        updatedAt: FieldValue.serverTimestamp(),
      });
      return { reminderId: input.reminderId, status: "open" };
    }

    const status = input.action === "complete" ? "done" : "cancelled";
    tx.update(ref, {
      status,
      completedAt: status === "done" ? FieldValue.serverTimestamp() : null,
      cancelledAt: status === "cancelled" ? FieldValue.serverTimestamp() : null,
      updatedAt: FieldValue.serverTimestamp(),
    });
    if (stateRef && stateSnap?.exists && stateSnap.get("openReminderId") === input.reminderId) {
      tx.set(
        stateRef,
        {
          openReminderId: null,
          openSourceVisitAt: null,
          lastCompletedSourceVisitAt:
            status === "done" ? (snap.get("sourceVisitAt") ?? stateSnap.get("lastCompletedSourceVisitAt") ?? null) : (stateSnap.get("lastCompletedSourceVisitAt") ?? null),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    }
    return { reminderId: input.reminderId, status, sourceVisitAt: asIso(snap.get("sourceVisitAt")) };
  });
}
