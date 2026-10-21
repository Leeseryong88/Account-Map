import { FieldValue } from "firebase-admin/firestore";
import { ZodError } from "zod";
import { revisitStateId } from "../../shared/src/ids";
import { archiveAccountSchema } from "../../shared/src/schemas";
import { ensureAdmin } from "./admin";
import { AppError } from "./errors";

export async function handleSetAccountArchived(uid: string, raw: unknown) {
  let input;
  try {
    input = archiveAccountSchema.parse(raw);
  } catch (error) {
    const message = error instanceof ZodError ? (error.issues[0]?.message ?? "입력값을 확인해 주세요.") : "입력값을 확인해 주세요.";
    throw new AppError("invalid-argument", message);
  }
  const db = ensureAdmin();
  return db.runTransaction(async (tx) => {
    const accountRef = db.doc(`users/${uid}/accounts/${input.accountId}`);
    const accountSnap = await tx.get(accountRef);
    if (!accountSnap.exists) throw new AppError("not-found", "거래처를 찾을 수 없습니다.");

    if (input.archived && input.cancelOpenReminders) {
      const openSnap = await tx.get(
        db.collection(`users/${uid}/reminders`).where("accountId", "==", input.accountId).where("status", "==", "open").limit(201),
      );
      if (openSnap.size > 200) {
        throw new AppError("failed-precondition", "미완료 알림이 너무 많아 한 번에 취소하지 못했습니다. 알림함에서 나눈 뒤 다시 보관해 주세요.");
      }
      const templateIds = [
        ...new Set(openSnap.docs.filter((doc) => doc.get("type") === "revisit" && doc.get("templateId")).map((doc) => String(doc.get("templateId")))),
      ];
      const stateSnaps = await Promise.all(
        templateIds.map((templateId) => tx.get(db.doc(`users/${uid}/revisitStates/${revisitStateId(input.accountId, templateId)}`))),
      );
      for (const doc of openSnap.docs) {
        tx.update(doc.ref, {
          status: "cancelled",
          cancelledAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
      for (const state of stateSnaps) {
        if (!state.exists) continue;
        tx.set(
          state.ref,
          { openReminderId: null, openSourceVisitAt: null, updatedAt: FieldValue.serverTimestamp() },
          { merge: true },
        );
      }
    }

    tx.update(accountRef, { archived: input.archived, updatedAt: FieldValue.serverTimestamp() });
    return { accountId: input.accountId, archived: input.archived };
  });
}
