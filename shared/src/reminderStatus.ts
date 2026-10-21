import { seoulDayNumber } from "./dates";
import type { AlertKind, TimeStatus } from "./types";

export function getReminderTimeStatus(input: {
  dueAt: string;
  allDay: boolean;
  leadDays: number;
  now?: string | Date;
}): TimeStatus {
  const now = input.now ? new Date(input.now) : new Date();
  const due = new Date(input.dueAt);
  const today = seoulDayNumber(now);
  const dueDay = seoulDayNumber(due);
  const lead = Math.max(0, input.leadDays);

  if (input.allDay) {
    if (dueDay < today) return "overdue";
    if (dueDay === today) return "today";
    if (lead > 0 && dueDay - today <= lead) return "soon";
    return "scheduled";
  }

  if (now.getTime() >= due.getTime()) return "overdue";
  if (dueDay === today) return "today";
  if (lead > 0 && dueDay > today && dueDay - today <= lead) return "soon";
  return "scheduled";
}

export function pickAlertBadge(statuses: TimeStatus[]): { kind: AlertKind | null; count: number } {
  const count = statuses.length;
  if (statuses.includes("overdue")) return { kind: "overdue", count };
  if (statuses.includes("today")) return { kind: "today", count };
  if (statuses.includes("soon")) return { kind: "soon", count };
  return { kind: null, count };
}

export function clusterHasUrgent(kinds: Array<AlertKind | null>): boolean {
  return kinds.some((kind) => kind === "overdue" || kind === "today");
}
