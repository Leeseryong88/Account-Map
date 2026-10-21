import { dueFromAnswer } from "./answers";
import { addSeoulDays, seoulDayStartIsoFromYmd } from "./dates";
import { fieldReminderDocId } from "./ids";
import type { AnswerValue, ReminderChange, RevisitRule, TaskStatus, TemplateField } from "./types";

export interface ExistingFieldReminder {
  id: string;
  fieldId: string;
  status: TaskStatus;
  dueAt: string;
  title: string;
  allDay: boolean;
  leadDays: number;
}

export interface OpenRevisit {
  id: string;
  dueAt: string;
  sourceVisitAt: string;
  visitId: string | null;
  title: string;
  leadDays: number;
  allDay: boolean;
}

export interface PlanVisitInput {
  visitId: string;
  visitedAt: string;
  templateId: string | null;
  templateName: string | null;
  fields: TemplateField[];
  revisitRule: RevisitRule | null;
  answers: Record<string, AnswerValue>;
  existingFieldReminders: ExistingFieldReminder[];
  openRevisit: OpenRevisit | null;
  lastCompletedSourceVisitAt: string | null;
  latestVisitAt: string | null;
  latestVisitId: string | null;
  newRevisitId: string;
}

function sameInstant(a: string, b: string): boolean {
  return new Date(a).getTime() === new Date(b).getTime();
}

export function planVisitEffects(input: PlanVisitInput): ReminderChange[] {
  const changes: ReminderChange[] = [];

  for (const field of input.fields) {
    if (!field.reminderRule) continue;
    const existing = input.existingFieldReminders.find((reminder) => reminder.fieldId === field.id);
    const due = dueFromAnswer(field, input.answers[field.id] ?? null);
    const reminderId = existing?.id ?? fieldReminderDocId(input.visitId, field.id);
    const title = field.reminderRule.title || field.label;

    if (!field.reminderRule.enabled || !due) {
      if (existing?.status === "open") {
        changes.push({
          action: "cancel",
          reminderId,
          type: "field",
          title: existing.title,
          dueAt: existing.dueAt,
          allDay: existing.allDay,
          leadDays: existing.leadDays,
          previousDueAt: existing.dueAt,
          fieldId: field.id,
          sourceVisitAt: null,
          visitId: input.visitId,
          note: null,
        });
      } else if (existing) {
        changes.push(keepField(existing, "완료되었거나 취소된 알림은 다시 열지 않습니다."));
      }
      continue;
    }

    if (!existing) {
      changes.push({
        action: "create",
        reminderId,
        type: "field",
        title,
        dueAt: due.dueAt,
        allDay: due.allDay,
        leadDays: field.reminderRule.leadDays,
        previousDueAt: null,
        fieldId: field.id,
        sourceVisitAt: null,
        visitId: input.visitId,
        note: null,
      });
      continue;
    }

    if (existing.status !== "open") {
      changes.push(keepField(existing, "완료되었거나 취소된 알림은 다시 열지 않습니다."));
      continue;
    }

    const unchanged =
      sameInstant(existing.dueAt, due.dueAt) &&
      existing.title === title &&
      existing.leadDays === field.reminderRule.leadDays &&
      existing.allDay === due.allDay;
    changes.push({
      action: unchanged ? "keep" : "update",
      reminderId: existing.id,
      type: "field",
      title,
      dueAt: due.dueAt,
      allDay: due.allDay,
      leadDays: field.reminderRule.leadDays,
      previousDueAt: existing.dueAt,
      fieldId: field.id,
      sourceVisitAt: null,
      visitId: input.visitId,
      note: null,
    });
  }

  const rule = input.revisitRule;
  if (rule?.enabled && input.templateId && input.latestVisitAt && input.latestVisitId) {
    const dueYmd = addSeoulDays(input.latestVisitAt, rule.daysAfterVisit);
    const dueAt = seoulDayStartIsoFromYmd(dueYmd);
    const title = `${input.templateName || "방문"} 재방문`;
    if (input.openRevisit) {
      const canMove = new Date(input.latestVisitAt).getTime() >= new Date(input.openRevisit.sourceVisitAt).getTime();
      if (!canMove) {
        changes.push({
          action: "keep",
          reminderId: input.openRevisit.id,
          type: "revisit",
          title: input.openRevisit.title,
          dueAt: input.openRevisit.dueAt,
          allDay: true,
          leadDays: input.openRevisit.leadDays,
          previousDueAt: input.openRevisit.dueAt,
          fieldId: null,
          sourceVisitAt: input.openRevisit.sourceVisitAt,
          visitId: input.openRevisit.visitId,
          note: "더 최근 방문 기준 일정은 유지됩니다.",
        });
      } else {
        const unchanged =
          sameInstant(input.openRevisit.dueAt, dueAt) &&
          input.openRevisit.leadDays === rule.leadDays &&
          input.openRevisit.title === title &&
          sameInstant(input.openRevisit.sourceVisitAt, input.latestVisitAt) &&
          input.openRevisit.visitId === input.latestVisitId;
        changes.push({
          action: unchanged ? "keep" : "update",
          reminderId: input.openRevisit.id,
          type: "revisit",
          title,
          dueAt,
          allDay: true,
          leadDays: rule.leadDays,
          previousDueAt: input.openRevisit.dueAt,
          fieldId: null,
          sourceVisitAt: input.latestVisitAt,
          visitId: input.latestVisitId,
          note: null,
        });
      }
    } else {
      const completed = input.lastCompletedSourceVisitAt;
      const newer = !completed || new Date(input.latestVisitAt).getTime() > new Date(completed).getTime();
      if (newer) {
        changes.push({
          action: "create",
          reminderId: input.newRevisitId,
          type: "revisit",
          title,
          dueAt,
          allDay: true,
          leadDays: rule.leadDays,
          previousDueAt: null,
          fieldId: null,
          sourceVisitAt: input.latestVisitAt,
          visitId: input.latestVisitId,
          note: null,
        });
      }
    }
  }

  return changes;
}

function keepField(existing: ExistingFieldReminder, note: string): ReminderChange {
  return {
    action: "keep",
    reminderId: existing.id,
    type: "field",
    title: existing.title,
    dueAt: existing.dueAt,
    allDay: existing.allDay,
    leadDays: existing.leadDays,
    previousDueAt: existing.dueAt,
    fieldId: existing.fieldId,
    sourceVisitAt: null,
    visitId: null,
    note,
  };
}

export function visibleReminderChanges(changes: ReminderChange[]): ReminderChange[] {
  return changes.filter((change) => change.action !== "keep" || change.note);
}
