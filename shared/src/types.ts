export const SALES_STATUSES = ["prospect", "contacting", "active", "hold", "closed"] as const;

export type SalesStatus = (typeof SALES_STATUSES)[number];

export const FIELD_TYPES = [
  "text",
  "textarea",
  "number",
  "single",
  "multi",
  "boolean",
  "date",
  "datetime",
  "checklist",
] as const;

export type FieldType = (typeof FIELD_TYPES)[number];

export type ReminderType = "revisit" | "field" | "manual";

export type TaskStatus = "open" | "done" | "cancelled";

export type TimeStatus = "scheduled" | "soon" | "today" | "overdue";

export type VisitTone = "none" | "recent" | "normal" | "warning" | "old";

export type AlertKind = "overdue" | "today" | "soon";

export interface FieldOption {
  id: string;
  label: string;
}

export interface FieldReminderRule {
  enabled: boolean;
  title: string;
  leadDays: number;
}

export const AUTO_FILL_SOURCES = ["accountName", "lastVisitDate"] as const;

export type AutoFillSource = (typeof AUTO_FILL_SOURCES)[number];

export interface TemplateField {
  id: string;
  type: FieldType;
  label: string;
  required: boolean;
  helpText: string;
  placeholder: string;
  options: FieldOption[];
  unit: string;
  reminderRule: FieldReminderRule | null;
  /** Older saved versions have no key; treat missing as null. */
  autoFill?: AutoFillSource | null;
}

export interface RevisitRule {
  enabled: boolean;
  daysAfterVisit: number;
  leadDays: number;
}

export interface TemplateSnapshot {
  templateId: string;
  versionId: string;
  versionNumber: number;
  name: string;
  description: string;
  fields: TemplateField[];
  revisitRule: RevisitRule;
}

export type AnswerValue = string | number | boolean | string[] | null;

export interface ContactSnapshot {
  contactId: string;
  name: string;
  role: string;
  department: string;
}

export interface VisitBands {
  recentDays: number;
  normalDays: number;
  warningDays: number;
}

export interface ReminderChange {
  action: "create" | "update" | "cancel" | "keep";
  reminderId: string;
  type: "revisit" | "field";
  title: string;
  dueAt: string | null;
  allDay: boolean;
  leadDays: number;
  previousDueAt: string | null;
  fieldId: string | null;
  sourceVisitAt: string | null;
  visitId: string | null;
  note: string | null;
}

export interface SaveVisitResult {
  visitId: string;
  alreadyApplied: boolean;
  visitCount: number;
  lastVisitAt: string | null;
  changes: ReminderChange[];
}

export const LIMITS = {
  accounts: 500,
  openReminders: 500,
  templates: 100,
  visitsPage: 20,
  contactsPerVisit: 20,
  fields: 40,
  options: 30,
  tags: 20,
  summary: 4000,
  memo: 4000,
} as const;

export const DEFAULT_BANDS: VisitBands = {
  recentDays: 7,
  normalDays: 30,
  warningDays: 60,
};

export const EMPTY_REVISIT: RevisitRule = {
  enabled: false,
  daysAfterVisit: 14,
  leadDays: 3,
};

export const FUNCTIONS_REGION = "asia-northeast3";
