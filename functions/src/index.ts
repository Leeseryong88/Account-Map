import { onCall, HttpsError } from "firebase-functions/v2/https";
import { ZodError } from "zod";
import { FUNCTIONS_REGION } from "../../shared/src/types";
import { ensureAdmin } from "./admin";
import { handleSetAccountArchived } from "./archiveAccount";
import { handleDeleteVisit } from "./deleteVisit";
import { AppError } from "./errors";
import { handleCreateManualReminder, handleUpdateReminder } from "./reminders";
import { handleSaveVisit } from "./saveVisit";

ensureAdmin();

function wrap<T>(handler: (uid: string, data: unknown) => Promise<T>) {
  return onCall({ region: FUNCTIONS_REGION, timeoutSeconds: 60, memory: "256MiB" }, async (request) => {
    if (!request.auth?.uid) throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
    try {
      return await handler(request.auth.uid, request.data);
    } catch (error) {
      if (error instanceof AppError) throw new HttpsError(error.code, error.message);
      if (error instanceof ZodError) throw new HttpsError("invalid-argument", error.issues[0]?.message ?? "입력값을 확인해 주세요.");
      console.error(error);
      throw new HttpsError("internal", "처리하지 못했습니다. 입력 내용은 그대로 두었습니다. 다시 시도해 주세요.");
    }
  });
}

export const saveVisit = wrap(handleSaveVisit);
export const deleteVisit = wrap(handleDeleteVisit);
export const setAccountArchived = wrap(handleSetAccountArchived);
export const createManualReminder = wrap(handleCreateManualReminder);
export const updateReminder = wrap(handleUpdateReminder);
