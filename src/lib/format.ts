import { formatKoreanDateTime, formatKoreanDayFromIso } from "@shared/dates";
import type { ReminderChange } from "@shared/types";

export function reminderWhen(input: { dueAt: string; allDay: boolean }) {
  return input.allDay ? formatKoreanDayFromIso(input.dueAt) : formatKoreanDateTime(input.dueAt);
}

export function describeChange(change: ReminderChange) {
  if (change.action === "keep") return change.note ?? "";
  const when = change.dueAt ? reminderWhen({ dueAt: change.dueAt, allDay: change.allDay }) : "";
  if (change.action === "create") return `${change.title} · ${when} 생성`;
  if (change.action === "cancel") return `${change.title} 취소`;
  const previous = change.previousDueAt ? reminderWhen({ dueAt: change.previousDueAt, allDay: change.allDay }) : "";
  return `${change.title} · ${previous} → ${when}`;
}

export function telHref(phone: string) {
  const cleaned = phone.replace(/[^\d+]/g, "");
  return cleaned ? `tel:${cleaned}` : null;
}
