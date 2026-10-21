import { getReminderTimeStatus } from "./reminderStatus";
import type { SalesStatus, TimeStatus, VisitBands } from "./types";
import { visitTone } from "./visitBands";

export type VisitFilter = "never" | "recent" | "normal" | "warning" | "old";
export type AlertFilter = "soon" | "today" | "overdue";
export type AccountSort = "recent" | "oldest" | "reminder" | "name";

export interface FilterState {
  query: string;
  visit: VisitFilter[];
  alert: AlertFilter[];
  status: SalesStatus[];
  tags: string[];
  templates: string[];
  area: boolean;
  archivedOnly: boolean;
  sort: AccountSort;
}

export interface GeoBounds {
  swLat: number;
  swLng: number;
  neLat: number;
  neLng: number;
}

export interface AccountFilterInput {
  id: string;
  name: string;
  address: string;
  contactSearchText: string;
  salesStatus: SalesStatus;
  tags: string[];
  templateIds: string[];
  archived: boolean;
  lat: number;
  lng: number;
  lastVisitAt: string | null;
}

export interface ReminderFilterInput {
  accountId: string;
  status: "open" | "done" | "cancelled";
  dueAt: string;
  allDay: boolean;
  leadDays: number;
}

export const EMPTY_FILTERS: FilterState = {
  query: "",
  visit: [],
  alert: [],
  status: [],
  tags: [],
  templates: [],
  area: false,
  archivedOnly: false,
  sort: "oldest",
};

const VISIT_FILTERS: VisitFilter[] = ["never", "recent", "normal", "warning", "old"];
const ALERT_FILTERS: AlertFilter[] = ["soon", "today", "overdue"];
const STATUSES: SalesStatus[] = ["prospect", "contacting", "active", "hold", "closed"];
const SORTS: AccountSort[] = ["recent", "oldest", "reminder", "name"];

export function countActiveFilters(filters: FilterState): number {
  return (
    filters.visit.length +
    filters.alert.length +
    filters.status.length +
    filters.tags.length +
    filters.templates.length +
    (filters.area ? 1 : 0) +
    (filters.archivedOnly ? 1 : 0)
  );
}

export function toggleValue<T extends string>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

function statusesFor(accountId: string, reminders: ReminderFilterInput[], now: Date): TimeStatus[] {
  return reminders
    .filter((reminder) => reminder.accountId === accountId && reminder.status === "open")
    .map((reminder) => getReminderTimeStatus({ dueAt: reminder.dueAt, allDay: reminder.allDay, leadDays: reminder.leadDays, now }));
}

export function matchAccount(
  account: AccountFilterInput,
  reminders: ReminderFilterInput[],
  filters: FilterState,
  bands: VisitBands,
  bounds: GeoBounds | null,
  now: Date,
): boolean {
  if (filters.archivedOnly) {
    if (!account.archived) return false;
  } else if (account.archived) {
    return false;
  }

  const query = filters.query.trim().toLowerCase();
  if (query) {
    const haystack = `${account.name}\n${account.address}\n${account.contactSearchText}`.toLowerCase();
    if (!haystack.includes(query)) return false;
  }

  if (filters.visit.length > 0) {
    const tone = visitTone(account.lastVisitAt, bands, now).tone;
    const visitKey: VisitFilter = tone === "none" ? "never" : tone;
    if (!filters.visit.includes(visitKey)) return false;
  }

  if (filters.alert.length > 0) {
    const statuses = statusesFor(account.id, reminders, now);
    if (!filters.alert.some((alert) => statuses.includes(alert))) return false;
  }

  if (filters.status.length > 0 && !filters.status.includes(account.salesStatus)) return false;
  if (filters.tags.length > 0 && !filters.tags.some((tag) => account.tags.includes(tag))) return false;
  if (filters.templates.length > 0 && !filters.templates.some((id) => account.templateIds.includes(id))) return false;

  if (filters.area && bounds && bounds.swLat <= bounds.neLat && bounds.swLng <= bounds.neLng) {
    if (account.lat < bounds.swLat || account.lat > bounds.neLat || account.lng < bounds.swLng || account.lng > bounds.neLng) {
      return false;
    }
  }
  return true;
}

export function sortAccounts<T extends AccountFilterInput>(items: T[], sort: AccountSort, nextDue: Map<string, string | null>): T[] {
  return items.slice().sort((a, b) => {
    if (sort === "name") return a.name.localeCompare(b.name, "ko") || a.id.localeCompare(b.id);
    if (sort === "recent") {
      const at = a.lastVisitAt ? Date.parse(a.lastVisitAt) : Number.NEGATIVE_INFINITY;
      const bt = b.lastVisitAt ? Date.parse(b.lastVisitAt) : Number.NEGATIVE_INFINITY;
      return bt - at || a.name.localeCompare(b.name, "ko");
    }
    if (sort === "oldest") {
      if (!a.lastVisitAt && b.lastVisitAt) return -1;
      if (a.lastVisitAt && !b.lastVisitAt) return 1;
      if (!a.lastVisitAt && !b.lastVisitAt) return a.name.localeCompare(b.name, "ko");
      return Date.parse(a.lastVisitAt!) - Date.parse(b.lastVisitAt!) || a.name.localeCompare(b.name, "ko");
    }
    const ad = nextDue.get(a.id);
    const bd = nextDue.get(b.id);
    if (ad && !bd) return -1;
    if (!ad && bd) return 1;
    if (!ad && !bd) return a.name.localeCompare(b.name, "ko");
    return Date.parse(ad!) - Date.parse(bd!) || a.name.localeCompare(b.name, "ko");
  });
}

export function earliestOpenDue(accountId: string, reminders: ReminderFilterInput[]): string | null {
  const dates = reminders
    .filter((reminder) => reminder.accountId === accountId && reminder.status === "open")
    .map((reminder) => reminder.dueAt)
    .sort((a, b) => Date.parse(a) - Date.parse(b));
  return dates[0] ?? null;
}

export interface SummaryCounts {
  total: number;
  never: number;
  old: number;
  soonAccounts: number;
  todayAccounts: number;
  overdueAccounts: number;
  soonReminders: number;
  todayReminders: number;
  overdueReminders: number;
}

export function summarize(
  accounts: AccountFilterInput[],
  reminders: ReminderFilterInput[],
  bands: VisitBands,
  now: Date,
): SummaryCounts {
  const active = accounts.filter((account) => !account.archived);
  const activeIds = new Set(active.map((account) => account.id));
  let never = 0;
  let old = 0;
  for (const account of active) {
    const tone = visitTone(account.lastVisitAt, bands, now).tone;
    if (tone === "none") never += 1;
    if (tone === "old") old += 1;
  }
  const open = reminders.filter((reminder) => reminder.status === "open" && activeIds.has(reminder.accountId));
  const byAccount = new Map<string, TimeStatus[]>();
  let soonReminders = 0;
  let todayReminders = 0;
  let overdueReminders = 0;
  for (const reminder of open) {
    const status = getReminderTimeStatus({ dueAt: reminder.dueAt, allDay: reminder.allDay, leadDays: reminder.leadDays, now });
    const list = byAccount.get(reminder.accountId) ?? [];
    list.push(status);
    byAccount.set(reminder.accountId, list);
    if (status === "soon") soonReminders += 1;
    if (status === "today") todayReminders += 1;
    if (status === "overdue") overdueReminders += 1;
  }
  let soonAccounts = 0;
  let todayAccounts = 0;
  let overdueAccounts = 0;
  for (const statuses of byAccount.values()) {
    if (statuses.includes("soon")) soonAccounts += 1;
    if (statuses.includes("today")) todayAccounts += 1;
    if (statuses.includes("overdue")) overdueAccounts += 1;
  }
  return { total: active.length, never, old, soonAccounts, todayAccounts, overdueAccounts, soonReminders, todayReminders, overdueReminders };
}

function splitList(value: string | null, allowed: readonly string[]): string[] {
  if (!value) return [];
  return value.split(",").map((item) => item.trim()).filter((item) => allowed.includes(item));
}

export function parseFilters(params: URLSearchParams): FilterState {
  const sort = params.get("sort");
  return {
    query: params.get("q") ?? "",
    visit: splitList(params.get("visit"), VISIT_FILTERS) as VisitFilter[],
    alert: splitList(params.get("alert"), ALERT_FILTERS) as AlertFilter[],
    status: splitList(params.get("status"), STATUSES) as SalesStatus[],
    tags: (params.get("tag") ?? "").split(",").map((tag) => tag.trim()).filter(Boolean).slice(0, 20),
    templates: (params.get("template") ?? "").split(",").map((id) => id.trim()).filter(Boolean).slice(0, 20),
    area: params.get("area") === "1",
    archivedOnly: params.get("archived") === "1",
    sort: SORTS.includes(sort as AccountSort) ? (sort as AccountSort) : "oldest",
  };
}

export function filtersToParams(filters: FilterState): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.query) params.set("q", filters.query);
  if (filters.sort !== "oldest") params.set("sort", filters.sort);
  if (filters.visit.length) params.set("visit", filters.visit.join(","));
  if (filters.alert.length) params.set("alert", filters.alert.join(","));
  if (filters.status.length) params.set("status", filters.status.join(","));
  if (filters.tags.length) params.set("tag", filters.tags.join(","));
  if (filters.templates.length) params.set("template", filters.templates.join(","));
  if (filters.area) params.set("area", "1");
  if (filters.archivedOnly) params.set("archived", "1");
  return params;
}
