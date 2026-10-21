import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { ZodError } from "zod";
import { fieldReminderDocId, revisitStateId } from "../../shared/src/ids";
import { planDeleteEffects } from "../../shared/src/planDelete";
import { deleteVisitSchema } from "../../shared/src/schemas";
import type { RevisitRule, TemplateSnapshot } from "../../shared/src/types";
import { applyVisitCount } from "../../shared/src/visits";
import { selectVisitAnchors } from "../../shared/src/visits";
import { asIso, ensureAdmin } from "./admin";
import { AppError } from "./errors";
import { applyReminderChanges } from "./saveVisit";

export async function handleDeleteVisit(uid: string, raw: unknown) {
  let input;
  try {
    input = deleteVisitSchema.parse(raw);
  } catch (error) {
    if (error instanceof ZodError) throw new AppError("invalid-argument", error.issues[0]?.message ?? "입력값을 확인해 주세요.");
    throw error;
  }
  const db = ensureAdmin();
  return db.runTransaction(async (tx) => {
    const idemRef = db.doc(`users/${uid}/idempotency/${input.clientRequestId}`);
    const idemSnap = await tx.get(idemRef);
    if (idemSnap.exists) {
      if (idemSnap.get("op") !== "deleteVisit") throw new AppError("already-exists", "이미 사용된 요청입니다.");
      return { ...idemSnap.get("result"), alreadyApplied: true };
    }

    const visitRef = db.doc(`users/${uid}/visits/${input.visitId}`);
    const visitSnap = await tx.get(visitRef);
    if (!visitSnap.exists) throw new AppError("not-found", "방문 기록을 찾을 수 없습니다.");
    const accountId = String(visitSnap.get("accountId"));
    const accountRef = db.doc(`users/${uid}/accounts/${accountId}`);
    const accountSnap = await tx.get(accountRef);
    if (!accountSnap.exists) throw new AppError("not-found", "거래처를 찾을 수 없습니다.");
    if (visitSnap.get("deleted") === true) {
      const result = {
        visitId: input.visitId,
        alreadyApplied: true,
        visitCount: Number(accountSnap.get("visitCount") ?? 0),
        lastVisitAt: asIso(accountSnap.get("lastVisitAt")),
      };
      tx.set(idemRef, { op: "deleteVisit", result, createdAt: FieldValue.serverTimestamp() });
      return result;
    }

    const templateId = (visitSnap.get("templateId") as string | null) ?? null;
    const snapshot = (visitSnap.get("formSnapshot") as TemplateSnapshot | null) ?? null;
    const templateSnap = templateId ? await tx.get(db.doc(`users/${uid}/templates/${templateId}`)) : null;
    const fields = Array.isArray(snapshot?.fields) ? snapshot.fields : [];
    const reminderSnaps = await Promise.all(
      fields.filter((field) => field.reminderRule).map((field) => tx.get(db.doc(`users/${uid}/reminders/${fieldReminderDocId(input.visitId, field.id)}`))),
    );
    const stateRef = templateId ? db.doc(`users/${uid}/revisitStates/${revisitStateId(accountId, templateId)}`) : null;
    const stateSnap = stateRef ? await tx.get(stateRef) : null;
    const openId = (stateSnap?.get("openReminderId") as string | null) ?? null;
    const openSnap = openId ? await tx.get(db.doc(`users/${uid}/reminders/${openId}`)) : null;
    const accountVisits = await tx.get(
      db.collection(`users/${uid}/visits`).where("accountId", "==", accountId).where("deleted", "==", false).orderBy("visitedAt", "desc").limit(5),
    );
    const templateVisits = templateId
      ? await tx.get(
          db
            .collection(`users/${uid}/visits`)
            .where("accountId", "==", accountId)
            .where("templateId", "==", templateId)
            .where("deleted", "==", false)
            .orderBy("visitedAt", "desc")
            .limit(5),
        )
      : null;

    const accountAnchors = selectVisitAnchors(
      accountVisits.docs.filter((doc) => doc.id !== input.visitId).map((doc) => ({ id: doc.id, visitedAt: asIso(doc.get("visitedAt")) ?? "" })),
    );
    const templateAnchors = selectVisitAnchors(
      (templateVisits?.docs ?? []).filter((doc) => doc.id !== input.visitId).map((doc) => ({ id: doc.id, visitedAt: asIso(doc.get("visitedAt")) ?? "" })),
    );
    const rule: RevisitRule | null =
      templateSnap?.exists && templateSnap.get("archived") !== true
        ? (templateSnap.get("revisitRule") as RevisitRule)
        : (snapshot?.revisitRule ?? null);
    const changes = planDeleteEffects({
      visitId: input.visitId,
      templateId,
      cancelLinkedFieldReminders: input.cancelLinkedFieldReminders,
      fieldReminders: reminderSnaps
        .filter((snap) => snap.exists)
        .map((snap) => ({
          id: snap.id,
          fieldId: String(snap.get("fieldId") ?? ""),
          status: snap.get("status"),
          title: String(snap.get("title") ?? ""),
          dueAt: asIso(snap.get("dueAt")) ?? "",
          allDay: snap.get("allDay") === true,
          leadDays: Number(snap.get("leadDays") ?? 0),
        })),
      openRevisit:
        openSnap?.exists && openSnap.get("status") === "open"
          ? {
              id: openSnap.id,
              dueAt: asIso(openSnap.get("dueAt")) ?? "",
              sourceVisitAt: asIso(openSnap.get("sourceVisitAt")) ?? "",
              visitId: (openSnap.get("visitId") as string | null) ?? null,
              title: String(openSnap.get("title") ?? ""),
              leadDays: Number(openSnap.get("leadDays") ?? 0),
              templateId: String(openSnap.get("templateId") ?? templateId ?? ""),
            }
          : null,
      remainingLatestAt: templateAnchors.latest?.visitedAt ?? null,
      remainingLatestId: templateAnchors.latest?.id ?? null,
      revisitRule: rule,
      templateName: templateSnap?.exists ? String(templateSnap.get("name") ?? snapshot?.name ?? "") : (snapshot?.name ?? null),
    });

    const visitCount = applyVisitCount(Number(accountSnap.get("visitCount") ?? 0), "delete");
    const lastVisitAt = accountAnchors.latest?.visitedAt ?? null;
    tx.update(visitRef, { deleted: true, deletedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    applyReminderChanges(db, tx, uid, changes, { id: accountId, name: String(accountSnap.get("name") ?? "") }, templateId);
    if (stateRef && templateId) {
      const revisitChange = changes.find((change) => change.type === "revisit" && change.action !== "keep");
      let openReminderId = openSnap?.exists && openSnap.get("status") === "open" ? openSnap.id : null;
      let openSourceVisitAt = openSnap?.exists ? openSnap.get("sourceVisitAt") : null;
      if (revisitChange?.action === "update") {
        openReminderId = revisitChange.reminderId;
        openSourceVisitAt = revisitChange.sourceVisitAt ? Timestamp.fromDate(new Date(revisitChange.sourceVisitAt)) : null;
      } else if (revisitChange?.action === "cancel") {
        openReminderId = null;
        openSourceVisitAt = null;
      }
      tx.set(
        stateRef,
        {
          accountId,
          templateId,
          openReminderId,
          openSourceVisitAt,
          lastCompletedSourceVisitAt: stateSnap?.get("lastCompletedSourceVisitAt") ?? null,
          latestVisitAt: templateAnchors.latest ? Timestamp.fromDate(new Date(templateAnchors.latest.visitedAt)) : null,
          latestVisitId: templateAnchors.latest?.id ?? null,
          previousVisitAt: templateAnchors.previous ? Timestamp.fromDate(new Date(templateAnchors.previous.visitedAt)) : null,
          previousVisitId: templateAnchors.previous?.id ?? null,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    }
    tx.update(accountRef, {
      visitCount,
      lastVisitAt: lastVisitAt ? Timestamp.fromDate(new Date(lastVisitAt)) : null,
      updatedAt: FieldValue.serverTimestamp(),
    });
    const result = { visitId: input.visitId, alreadyApplied: false, visitCount, lastVisitAt, changes };
    tx.set(idemRef, { op: "deleteVisit", result, createdAt: FieldValue.serverTimestamp() });
    return result;
  });
}
