import type { DocumentData } from "firebase/firestore";
import type { AccountFilterInput } from "@shared/filters";
import type { ReminderType, RevisitRule, SalesStatus, TaskStatus } from "@shared/types";

export interface AccountRecord extends AccountFilterInput {
  industry: string;
  phone: string;
  memo: string;
  primaryContactName: string;
  defaultTemplateId: string | null;
  visitCount: number;
}

export interface TemplateRecord {
  id: string;
  name: string;
  description: string;
  archived: boolean;
  currentVersionId: string;
  currentVersionNumber: number;
  revisitRule: RevisitRule;
}

export interface ReminderRecord {
  id: string;
  accountId: string;
  accountName: string;
  type: ReminderType;
  title: string;
  memo: string;
  dueAt: string;
  allDay: boolean;
  leadDays: number;
  status: TaskStatus;
  read: boolean;
  visitId: string | null;
  templateId: string | null;
  fieldId: string | null;
  sourceVisitAt: string | null;
}

export interface ContactRecord {
  id: string;
  accountId: string;
  name: string;
  role: string;
  department: string;
  phone: string;
  email: string;
  memo: string;
  isPrimary: boolean;
  active: boolean;
}

function text(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function time(value: unknown): string | null {
  if (!value || typeof value !== "object" || !("toDate" in value) || typeof value.toDate !== "function") return null;
  return value.toDate().toISOString();
}

export function accountFromDoc(id: string, data: DocumentData): AccountRecord {
  return {
    id,
    name: text(data.name),
    address: text(data.address),
    lat: typeof data.lat === "number" ? data.lat : 0,
    lng: typeof data.lng === "number" ? data.lng : 0,
    industry: text(data.industry),
    phone: text(data.phone),
    tags: Array.isArray(data.tags) ? data.tags.filter((tag) => typeof tag === "string") : [],
    memo: text(data.memo),
    salesStatus: (data.salesStatus ?? "prospect") as SalesStatus,
    archived: data.archived === true,
    contactSearchText: text(data.contactSearchText),
    primaryContactName: text(data.primaryContactName),
    templateIds: Array.isArray(data.templateIds) ? data.templateIds.filter((item) => typeof item === "string") : [],
    defaultTemplateId: typeof data.defaultTemplateId === "string" ? data.defaultTemplateId : null,
    lastVisitAt: time(data.lastVisitAt),
    visitCount: typeof data.visitCount === "number" ? data.visitCount : 0,
  };
}

export function templateFromDoc(id: string, data: DocumentData): TemplateRecord {
  const rule = data.revisitRule ?? {};
  return {
    id,
    name: text(data.name),
    description: text(data.description),
    archived: data.archived === true,
    currentVersionId: text(data.currentVersionId),
    currentVersionNumber: typeof data.currentVersionNumber === "number" ? data.currentVersionNumber : 1,
    revisitRule: {
      enabled: rule.enabled === true,
      daysAfterVisit: typeof rule.daysAfterVisit === "number" ? rule.daysAfterVisit : 14,
      leadDays: typeof rule.leadDays === "number" ? rule.leadDays : 3,
    },
  };
}

export function reminderFromDoc(id: string, data: DocumentData): ReminderRecord | null {
  const dueAt = time(data.dueAt);
  if (!dueAt) return null;
  return {
    id,
    accountId: text(data.accountId),
    accountName: text(data.accountName),
    type: (data.type ?? "manual") as ReminderType,
    title: text(data.title, "알림"),
    memo: text(data.memo),
    dueAt,
    allDay: data.allDay === true,
    leadDays: typeof data.leadDays === "number" ? data.leadDays : 0,
    status: (data.status ?? "open") as TaskStatus,
    read: data.read === true,
    visitId: typeof data.visitId === "string" ? data.visitId : null,
    templateId: typeof data.templateId === "string" ? data.templateId : null,
    fieldId: typeof data.fieldId === "string" ? data.fieldId : null,
    sourceVisitAt: time(data.sourceVisitAt),
  };
}

export function contactFromDoc(id: string, data: DocumentData): ContactRecord {
  return {
    id,
    accountId: text(data.accountId),
    name: text(data.name),
    role: text(data.role),
    department: text(data.department),
    phone: text(data.phone),
    email: text(data.email),
    memo: text(data.memo),
    isPrimary: data.isPrimary === true,
    active: data.active !== false,
  };
}
