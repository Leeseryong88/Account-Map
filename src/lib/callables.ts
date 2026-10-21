import { httpsCallable } from "firebase/functions";
import type { ArchiveAccountInput, DeleteVisitInput, ManualReminderInput, SaveVisitInput, UpdateReminderInput } from "@shared/schemas";
import type { SaveVisitResult } from "@shared/types";
import { getFirebase } from "./firebase";

export function callableErrorMessage(error: unknown): string {
  const code = typeof error === "object" && error && "code" in error ? String((error as { code: string }).code) : "";
  const raw = typeof error === "object" && error && "message" in error ? String((error as { message: string }).message) : "";
  if (code.includes("unavailable") || code.includes("network")) {
    return "저장 서버에 연결하지 못했습니다. 에뮬레이터 또는 네트워크를 확인한 뒤 다시 시도해 주세요.";
  }
  if (code.includes("unauthenticated")) return "로그인이 필요합니다.";
  const cleaned = raw.replace(/^FirebaseError:\s*/, "").replace(/^[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)?:\s*/, "");
  if (cleaned && !cleaned.startsWith("internal")) return cleaned;
  return "저장하지 못했습니다. 입력 내용은 그대로 두었습니다. 다시 시도해 주세요.";
}

async function call<TInput, TOutput>(name: string, data: TInput): Promise<TOutput> {
  const fn = httpsCallable<TInput, TOutput>(getFirebase().functions, name);
  const result = await fn(data);
  return result.data;
}

export function callSaveVisit(data: SaveVisitInput) {
  return call<SaveVisitInput, SaveVisitResult>("saveVisit", data);
}

export function callDeleteVisit(data: DeleteVisitInput) {
  return call<DeleteVisitInput, { visitId: string; alreadyApplied: boolean }>("deleteVisit", data);
}

export function callSetAccountArchived(data: ArchiveAccountInput) {
  return call<ArchiveAccountInput, { archived: boolean }>("setAccountArchived", data);
}

export function callCreateManualReminder(data: ManualReminderInput) {
  return call<ManualReminderInput, { reminderId: string }>("createManualReminder", data);
}

export function callUpdateReminder(data: UpdateReminderInput) {
  return call<UpdateReminderInput, { reminderId: string; status: string }>("updateReminder", data);
}
