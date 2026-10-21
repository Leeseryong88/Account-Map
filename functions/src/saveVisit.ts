import { FieldValue, Timestamp, type Firestore, type QueryDocumentSnapshot, type Transaction } from "firebase-admin/firestore";
import { ZodError } from "zod";
import { validateAnswers } from "../../shared/src/answers";
import { assertVisitedAt } from "../../shared/src/dates";
import { fieldReminderDocId, revisitDocId, revisitStateId, visitDocId } from "../../shared/src/ids";
import { planVisitEffects, type ExistingFieldReminder, type OpenRevisit } from "../../shared/src/planVisit";
import { saveVisitSchema } from "../../shared/src/schemas";
import type { ReminderChange, RevisitRule, SaveVisitResult, TemplateField, TemplateSnapshot } from "../../shared/src/types";
import { selectVisitAnchors } from "../../shared/src/visits";
import { asIso, ensureAdmin } from "./admin";
import { AppError } from "./errors";

function parseInput(raw: unknown) {
  try {
    return saveVisitSchema.parse(raw);
  } catch (error) {
    if (error instanceof ZodError) throw new AppError("invalid-argument", error.issues[0]?.message ?? "입력값을 확인해 주세요.");
    throw error;
  }
}

function visitRows(docs: QueryDocumentSnapshot[]) {
  return docs.map((doc) => ({
    id: doc.id,
    visitedAt: asIso(doc.get("visitedAt")) ?? "",
    deleted: doc.get("deleted") === true,
  }));
}

export async function handleSaveVisit(uid: string, raw: unknown): Promise<SaveVisitResult> {
  const input = parseInput(raw);
  const db = ensureAdmin();
  const visitId = input.visitId ?? visitDocId(input.clientRequestId);

  return db.runTransaction(async (tx) => {
    const idemRef = db.doc(`users/${uid}/idempotency/${input.clientRequestId}`);
    const idemSnap = await tx.get(idemRef);
    if (idemSnap.exists) {
      if (idemSnap.get("op") !== "saveVisit") throw new AppError("already-exists", "이미 사용된 요청입니다.");
      return { ...(idemSnap.get("result") as SaveVisitResult), alreadyApplied: true };
    }

    const visitRef = db.doc(`users/${uid}/visits/${visitId}`);
    const accountRef = db.doc(`users/${uid}/accounts/${input.accountId}`);
    const [visitSnap, accountSnap] = await Promise.all([tx.get(visitRef), tx.get(accountRef)]);
    if (!accountSnap.exists) throw new AppError("not-found", "거래처를 찾을 수 없습니다.");
    if (input.visitId) {
      if (!visitSnap.exists || visitSnap.get("deleted") === true) throw new AppError("not-found", "방문 기록을 찾을 수 없습니다.");
      if (visitSnap.get("accountId") !== input.accountId) throw new AppError("invalid-argument", "거래처를 바꿀 수 없습니다.");
    } else if (visitSnap.exists) {
      throw new AppError("already-exists", "이미 저장된 방문 기록입니다.");
    }

    let visitedAt: Date;
    try {
      visitedAt = assertVisitedAt(input.visitedAt);
    } catch (error) {
      throw new AppError("invalid-argument", error instanceof Error ? error.message : "방문 일시를 확인해 주세요.");
    }

    const contactIds = [...new Set(input.contactIds)];
    const contactSnaps = await Promise.all(contactIds.map((id) => tx.get(db.doc(`users/${uid}/contacts/${id}`))));
    const contacts = contactSnaps.map((snap) => {
      if (!snap.exists || snap.get("accountId") !== input.accountId) {
        throw new AppError("invalid-argument", "담당자 정보를 다시 선택해 주세요.");
      }
      return {
        contactId: snap.id,
        name: String(snap.get("name") ?? ""),
        role: String(snap.get("role") ?? ""),
        department: String(snap.get("department") ?? ""),
      };
    });

    const templateId = input.visitId ? (visitSnap.get("templateId") as string | null) : input.templateId;
    const loaded = await loadTemplateContext(db, tx, uid, {
      templateId,
      isUpdate: Boolean(input.visitId),
      existingSnapshot: (visitSnap.get("formSnapshot") as TemplateSnapshot | undefined) ?? null,
      existingTemplateName: (visitSnap.get("templateName") as string | null) ?? null,
    });

    const answerCheck = validateAnswers(loaded.fields, input.answers);
    if (Object.keys(answerCheck.errors).length > 0) {
      throw new AppError("invalid-argument", Object.values(answerCheck.errors)[0] ?? "입력값을 확인해 주세요.");
    }

    const reminderSnaps = await Promise.all(
      loaded.fields
        .filter((field) => field.reminderRule)
        .map((field) => tx.get(db.doc(`users/${uid}/reminders/${fieldReminderDocId(visitId, field.id)}`))),
    );
    const stateRef = templateId ? db.doc(`users/${uid}/revisitStates/${revisitStateId(input.accountId, templateId)}`) : null;
    const stateSnap = stateRef ? await tx.get(stateRef) : null;
    const openReminderId = (stateSnap?.get("openReminderId") as string | null) ?? null;
    const openSnap = openReminderId ? await tx.get(db.doc(`users/${uid}/reminders/${openReminderId}`)) : null;

    const accountQuery = db.collection(`users/${uid}/visits`).where("accountId", "==", input.accountId).where("deleted", "==", false).orderBy("visitedAt", "desc").limit(5);
    const templateQuery = templateId
      ? db
          .collection(`users/${uid}/visits`)
          .where("accountId", "==", input.accountId)
          .where("templateId", "==", templateId)
          .where("deleted", "==", false)
          .orderBy("visitedAt", "desc")
          .limit(5)
      : null;
    const accountVisits = await tx.get(accountQuery);
    const templateVisits = templateQuery ? await tx.get(templateQuery) : null;

    const visitedAtIso = visitedAt.toISOString();
    const accountAnchors = selectVisitAnchors([
      ...visitRows(accountVisits.docs).filter((visit) => visit.id !== visitId),
      { id: visitId, visitedAt: visitedAtIso },
    ]);
    const templateAnchors = selectVisitAnchors(
      templateId
        ? [...visitRows(templateVisits?.docs ?? []).filter((visit) => visit.id !== visitId), { id: visitId, visitedAt: visitedAtIso }]
        : [],
    );

    const existingFieldReminders: ExistingFieldReminder[] = reminderSnaps
      .filter((snap) => snap.exists)
      .map((snap) => ({
        id: snap.id,
        fieldId: String(snap.get("fieldId") ?? ""),
        status: snap.get("status"),
        dueAt: asIso(snap.get("dueAt")) ?? visitedAtIso,
        title: String(snap.get("title") ?? ""),
        allDay: snap.get("allDay") === true,
        leadDays: Number(snap.get("leadDays") ?? 0),
      }));

    let openRevisit: OpenRevisit | null = null;
    if (openSnap?.exists && openSnap.get("status") === "open") {
      openRevisit = {
        id: openSnap.id,
        dueAt: asIso(openSnap.get("dueAt")) ?? visitedAtIso,
        sourceVisitAt: asIso(openSnap.get("sourceVisitAt")) ?? visitedAtIso,
        visitId: (openSnap.get("visitId") as string | null) ?? null,
        title: String(openSnap.get("title") ?? ""),
        leadDays: Number(openSnap.get("leadDays") ?? 0),
        allDay: true,
      };
    }

    const thisIsLatest = templateAnchors.latest?.id === visitId;
    const ruleForPlan = !openRevisit || thisIsLatest ? loaded.schedulingRule : null;
    const changes = planVisitEffects({
      visitId,
      visitedAt: visitedAtIso,
      templateId,
      templateName: loaded.templateName,
      fields: loaded.fields,
      revisitRule: ruleForPlan,
      answers: answerCheck.normalized,
      existingFieldReminders,
      openRevisit,
      lastCompletedSourceVisitAt: asIso(stateSnap?.get("lastCompletedSourceVisitAt")),
      latestVisitAt: templateAnchors.latest?.visitedAt ?? null,
      latestVisitId: templateAnchors.latest?.id ?? null,
      newRevisitId: revisitDocId(input.clientRequestId),
    });

    const previousCount = Number(accountSnap.get("visitCount") ?? 0);
    const visitCount = input.visitId ? previousCount : previousCount + 1;
    const lastVisitAt = accountAnchors.latest?.visitedAt ?? null;
    const accountName = String(accountSnap.get("name") ?? "");

    tx.set(visitRef, {
      accountId: input.accountId,
      accountName,
      visitedAt: Timestamp.fromDate(visitedAt),
      summary: input.summary.trim(),
      contacts,
      templateId,
      templateName: loaded.templateName,
      versionId: loaded.snapshot?.versionId ?? null,
      formSnapshot: loaded.snapshot,
      answers: answerCheck.normalized,
      clientRequestId: input.clientRequestId,
      deleted: false,
      deletedAt: null,
      createdAt: input.visitId ? visitSnap.get("createdAt") : FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    applyReminderChanges(db, tx, uid, changes, { id: input.accountId, name: accountName }, templateId);

    if (stateRef && templateId) {
      let nextOpenId: string | null = openRevisit?.id ?? null;
      let nextOpenSource: string | null = openRevisit?.sourceVisitAt ?? null;
      const revisitChange = changes.find((change) => change.type === "revisit" && change.action !== "keep");
      if (revisitChange?.action === "create" || revisitChange?.action === "update") {
        nextOpenId = revisitChange.reminderId;
        nextOpenSource = revisitChange.sourceVisitAt;
      } else if (revisitChange?.action === "cancel") {
        nextOpenId = null;
        nextOpenSource = null;
      } else if (!openRevisit) {
        nextOpenId = null;
        nextOpenSource = null;
      }
      tx.set(stateRef, {
        accountId: input.accountId,
        templateId,
        openReminderId: nextOpenId,
        openSourceVisitAt: nextOpenSource ? Timestamp.fromDate(new Date(nextOpenSource)) : null,
        lastCompletedSourceVisitAt: stateSnap?.get("lastCompletedSourceVisitAt") ?? null,
        latestVisitAt: templateAnchors.latest ? Timestamp.fromDate(new Date(templateAnchors.latest.visitedAt)) : null,
        latestVisitId: templateAnchors.latest?.id ?? null,
        previousVisitAt: templateAnchors.previous ? Timestamp.fromDate(new Date(templateAnchors.previous.visitedAt)) : null,
        previousVisitId: templateAnchors.previous?.id ?? null,
        updatedAt: FieldValue.serverTimestamp(),
      });
    }

    tx.update(accountRef, {
      lastVisitAt: lastVisitAt ? Timestamp.fromDate(new Date(lastVisitAt)) : null,
      visitCount,
      updatedAt: FieldValue.serverTimestamp(),
    });

    const result: SaveVisitResult = { visitId, alreadyApplied: false, visitCount, lastVisitAt, changes };
    tx.set(idemRef, { op: "saveVisit", result, createdAt: FieldValue.serverTimestamp() });
    return result;
  });
}

async function loadTemplateContext(
  db: Firestore,
  tx: Transaction,
  uid: string,
  input: {
    templateId: string | null;
    isUpdate: boolean;
    existingSnapshot: TemplateSnapshot | null;
    existingTemplateName: string | null;
  },
): Promise<{ snapshot: TemplateSnapshot | null; fields: TemplateField[]; templateName: string | null; schedulingRule: RevisitRule | null }> {
  if (!input.templateId) {
    return { snapshot: null, fields: [], templateName: null, schedulingRule: null };
  }
  const templateSnap = await tx.get(db.doc(`users/${uid}/templates/${input.templateId}`));
  if (!input.isUpdate) {
    if (!templateSnap.exists || templateSnap.get("archived") === true) {
      throw new AppError("failed-precondition", "사용할 수 있는 템플릿이 아닙니다.");
    }
    const versionId = String(templateSnap.get("currentVersionId") ?? "");
    const versionSnap = await tx.get(db.doc(`users/${uid}/templates/${input.templateId}/versions/${versionId}`));
    if (!versionSnap.exists) throw new AppError("not-found", "템플릿 양식을 찾을 수 없습니다.");
    const fields = versionSnap.get("fields");
    if (!Array.isArray(fields)) throw new AppError("failed-precondition", "템플릿 양식을 읽을 수 없습니다.");
    const snapshot: TemplateSnapshot = {
      templateId: input.templateId,
      versionId,
      versionNumber: Number(versionSnap.get("versionNumber") ?? 1),
      name: String(versionSnap.get("name") ?? templateSnap.get("name") ?? ""),
      description: String(versionSnap.get("description") ?? ""),
      fields,
      revisitRule: versionSnap.get("revisitRule") ?? { enabled: false, daysAfterVisit: 14, leadDays: 3 },
    };
    return { snapshot, fields, templateName: snapshot.name, schedulingRule: snapshot.revisitRule };
  }

  const snapshot = input.existingSnapshot;
  const fields = Array.isArray(snapshot?.fields) ? snapshot.fields : [];
  const schedulingRule =
    templateSnap.exists && templateSnap.get("archived") !== true
      ? (templateSnap.get("revisitRule") as RevisitRule)
      : (snapshot?.revisitRule ?? null);
  return {
    snapshot,
    fields,
    templateName: templateSnap.exists ? String(templateSnap.get("name") ?? input.existingTemplateName ?? "") : input.existingTemplateName,
    schedulingRule,
  };
}

export function applyReminderChanges(
  db: Firestore,
  tx: Transaction,
  uid: string,
  changes: ReminderChange[],
  account: { id: string; name: string },
  templateId: string | null,
) {
  for (const change of changes) {
    if (change.action === "keep") continue;
    const ref = db.doc(`users/${uid}/reminders/${change.reminderId}`);
    if (change.action === "create") {
      tx.set(ref, {
        accountId: account.id,
        accountName: account.name,
        type: change.type,
        title: change.title,
        memo: "",
        dueAt: change.dueAt ? Timestamp.fromDate(new Date(change.dueAt)) : null,
        allDay: change.allDay,
        leadDays: change.leadDays,
        status: "open",
        read: false,
        visitId: change.visitId,
        templateId: change.type === "revisit" ? templateId : templateId,
        fieldId: change.fieldId,
        sourceVisitAt: change.sourceVisitAt ? Timestamp.fromDate(new Date(change.sourceVisitAt)) : null,
        idempotencyKey: change.reminderId,
        completedAt: null,
        cancelledAt: null,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    } else if (change.action === "update" && change.dueAt) {
      tx.update(ref, {
        title: change.title,
        dueAt: Timestamp.fromDate(new Date(change.dueAt)),
        allDay: change.allDay,
        leadDays: change.leadDays,
        sourceVisitAt: change.sourceVisitAt ? Timestamp.fromDate(new Date(change.sourceVisitAt)) : null,
        visitId: change.visitId,
        accountName: account.name,
        updatedAt: FieldValue.serverTimestamp(),
      });
    } else if (change.action === "cancel") {
      tx.update(ref, {
        status: "cancelled",
        cancelledAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
  }
}
