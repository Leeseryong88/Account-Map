import { addSeoulDays, seoulDayStartIsoFromYmd } from "./dates";
import type { ReminderChange, RevisitRule, TaskStatus } from "./types";

export interface DeleteFieldReminder {
  id: string;
  fieldId: string;
  status: TaskStatus;
  title: string;
  dueAt: string;
  allDay: boolean;
  leadDays: number;
}

export interface DeleteOpenRevisit {
  id: string;
  dueAt: string;
  sourceVisitAt: string;
  visitId: string | null;
  title: string;
  leadDays: number;
  templateId: string;
}

export function planDeleteEffects(input: {
  visitId: string;
  templateId: string | null;
  cancelLinkedFieldReminders: boolean;
  fieldReminders: DeleteFieldReminder[];
  openRevisit: DeleteOpenRevisit | null;
  remainingLatestAt: string | null;
  remainingLatestId: string | null;
  revisitRule: RevisitRule | null;
  templateName: string | null;
}): ReminderChange[] {
  const changes: ReminderChange[] = [];

  for (const reminder of input.fieldReminders) {
    if (reminder.status !== "open") continue;
    changes.push({
      action: input.cancelLinkedFieldReminders ? "cancel" : "keep",
      reminderId: reminder.id,
      type: "field",
      title: reminder.title,
      dueAt: reminder.dueAt,
      allDay: reminder.allDay,
      leadDays: reminder.leadDays,
      previousDueAt: reminder.dueAt,
      fieldId: reminder.fieldId,
      sourceVisitAt: null,
      visitId: input.visitId,
      note: null,
    });
  }

  const revisit = input.openRevisit;
  if (!revisit || revisit.templateId !== input.templateId) return changes;

  if (!input.remainingLatestAt || !input.remainingLatestId) {
    changes.push({
      action: "cancel",
      reminderId: revisit.id,
      type: "revisit",
      title: revisit.title,
      dueAt: revisit.dueAt,
      allDay: true,
      leadDays: revisit.leadDays,
      previousDueAt: revisit.dueAt,
      fieldId: null,
      sourceVisitAt: revisit.sourceVisitAt,
      visitId: revisit.visitId,
      note: "남은 방문이 없어 재방문 알림을 취소합니다.",
    });
    return changes;
  }

  if (!input.revisitRule?.enabled) return changes;

  const dueAt = seoulDayStartIsoFromYmd(addSeoulDays(input.remainingLatestAt, input.revisitRule.daysAfterVisit));
  const title = `${input.templateName || "방문"} 재방문`;
  const unchanged =
    new Date(revisit.dueAt).getTime() === new Date(dueAt).getTime() &&
    revisit.leadDays === input.revisitRule.leadDays &&
    revisit.title === title &&
    new Date(revisit.sourceVisitAt).getTime() === new Date(input.remainingLatestAt).getTime() &&
    revisit.visitId === input.remainingLatestId;
  changes.push({
    action: unchanged ? "keep" : "update",
    reminderId: revisit.id,
    type: "revisit",
    title,
    dueAt,
    allDay: true,
    leadDays: input.revisitRule.leadDays,
    previousDueAt: revisit.dueAt,
    fieldId: null,
    sourceVisitAt: input.remainingLatestAt,
    visitId: input.remainingLatestId,
    note: null,
  });
  return changes;
}
