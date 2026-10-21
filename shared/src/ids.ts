export function createId(prefix: string): string {
  const hex = globalThis.crypto?.randomUUID?.().replace(/-/g, "") ?? `${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`;
  return `${prefix}${hex}`;
}

export function visitDocId(clientRequestId: string): string {
  return `v${clientRequestId.replace(/[^a-zA-Z0-9]/g, "")}`;
}

export function fieldReminderDocId(visitId: string, fieldId: string): string {
  return `fr_${visitId}_${fieldId}`;
}

export function revisitDocId(clientRequestId: string): string {
  return `rv_${clientRequestId.replace(/[^a-zA-Z0-9]/g, "")}`;
}

export function manualReminderDocId(clientRequestId: string): string {
  return `mr_${clientRequestId.replace(/[^a-zA-Z0-9]/g, "")}`;
}

export function revisitStateId(accountId: string, templateId: string): string {
  return `${accountId}__${templateId}`;
}

export function linkDocId(accountId: string, templateId: string): string {
  return `${accountId}__${templateId}`;
}

export function moveItem<T>(items: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) return items;
  const next = items.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item as T);
  return next;
}
