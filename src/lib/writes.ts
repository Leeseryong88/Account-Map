import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import type { SalesStatus, TemplateField } from "@shared/types";
import { linkDocId } from "@shared/ids";
import type { TemplateDraft } from "@shared/templateDraft";
import { validateTemplate } from "@shared/templateDraft";
import { DEFAULT_TEMPLATE_ID, STARTER_TEMPLATE } from "@shared/starterTemplate";
import { createId } from "@shared/ids";
import { getFirebase } from "./firebase";
import type { ContactRecord } from "./records";

export async function commitAndConfirm(path: string, write: () => Promise<void>) {
  const ref = doc(getFirebase().db, path);
  await write();
  await getDocFromServer(ref);
  return ref.id;
}

export async function createAccount(uid: string, input: {
  name: string;
  address: string;
  lat: number;
  lng: number;
  industry: string;
  phone: string;
  tags: string[];
  memo: string;
  salesStatus: SalesStatus;
}) {
  const id = createId("a");
  const path = `users/${uid}/accounts/${id}`;
  await commitAndConfirm(path, () => setDoc(doc(getFirebase().db, path), {
    ...input,
    archived: false,
    contactSearchText: "",
    primaryContactName: "",
    templateIds: [],
    defaultTemplateId: null,
    lastVisitAt: null,
    visitCount: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }));
  return id;
}

export async function updateAccount(uid: string, accountId: string, input: {
  name: string;
  address: string;
  lat: number;
  lng: number;
  industry: string;
  phone: string;
  tags: string[];
  memo: string;
  salesStatus: SalesStatus;
}) {
  const path = `users/${uid}/accounts/${accountId}`;
  await commitAndConfirm(path, () => updateDoc(doc(getFirebase().db, path), { ...input, updatedAt: serverTimestamp() }));
}

export function contactSearchText(contacts: Array<{ name: string }>) {
  return contacts.map((contact) => contact.name.trim()).filter(Boolean).join(" ").slice(0, 1500);
}

export function primaryName(contacts: ContactRecord[]) {
  const active = contacts.filter((contact) => contact.active);
  return active.find((contact) => contact.isPrimary)?.name ?? active[0]?.name ?? "";
}

export async function saveContact(uid: string, input: Omit<ContactRecord, "id"> & { id?: string }, allContacts: ContactRecord[]) {
  const db = getFirebase().db;
  const id = input.id ? input.id : createId("c");
  const batch = writeBatch(db);
  const ref = doc(db, `users/${uid}/contacts/${id}`);
  const next = { ...input, id };
  const others = allContacts.filter((contact) => contact.id !== id).map((contact) => (
    next.isPrimary && contact.isPrimary ? { ...contact, isPrimary: false } : contact
  ));
  for (const contact of others) {
    const previous = allContacts.find((item) => item.id === contact.id);
    if (previous && previous.isPrimary !== contact.isPrimary) {
      batch.update(doc(db, `users/${uid}/contacts/${contact.id}`), { isPrimary: false, updatedAt: serverTimestamp() });
    }
  }
  if (input.id) {
    batch.update(ref, {
      name: input.name,
      role: input.role,
      department: input.department,
      phone: input.phone,
      email: input.email,
      memo: input.memo,
      isPrimary: input.isPrimary,
      active: input.active,
      updatedAt: serverTimestamp(),
    });
  } else {
    batch.set(ref, {
      accountId: input.accountId,
      name: input.name,
      role: input.role,
      department: input.department,
      phone: input.phone,
      email: input.email,
      memo: input.memo,
      isPrimary: input.isPrimary,
      active: input.active,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }
  const merged = [...others, next];
  batch.update(doc(db, `users/${uid}/accounts/${input.accountId}`), {
    contactSearchText: contactSearchText(merged),
    primaryContactName: primaryName(merged),
    updatedAt: serverTimestamp(),
  });
  await batch.commit();
  await getDocFromServer(ref);
  return id;
}

export async function saveTemplate(uid: string, templateId: string | null, draft: TemplateDraft) {
  const checked = validateTemplate(draft);
  if (!checked.value) return { id: null as string | null, errors: checked.errors };
  const db = getFirebase().db;
  const id = templateId ?? createId("t");
  const versionId = createId("ver");
  const templateRef = doc(db, `users/${uid}/templates/${id}`);
  const existing = templateId ? await getDoc(templateRef) : null;
  const versionNumber = Number(existing?.data()?.currentVersionNumber ?? 0) + 1;
  const batch = writeBatch(db);
  batch.set(doc(db, `users/${uid}/templates/${id}/versions/${versionId}`), {
    versionNumber,
    name: checked.value.name,
    description: checked.value.description,
    fields: checked.value.fields,
    revisitRule: checked.value.revisitRule,
    createdAt: serverTimestamp(),
  });
  const payload = {
    name: checked.value.name,
    description: checked.value.description,
    archived: existing?.data()?.archived === true,
    currentVersionId: versionId,
    currentVersionNumber: versionNumber,
    revisitRule: checked.value.revisitRule,
    updatedAt: serverTimestamp(),
  };
  if (!existing?.exists()) batch.set(templateRef, { ...payload, archived: false, createdAt: serverTimestamp() });
  else batch.update(templateRef, payload);
  await batch.commit();
  await getDocFromServer(templateRef);
  return { id, errors: {} as Record<string, string> };
}

export async function loadTemplateDraft(uid: string, templateId: string): Promise<{ draft: TemplateDraft; archived: boolean; versionNumber: number } | null> {
  const db = getFirebase().db;
  const template = await getDoc(doc(db, `users/${uid}/templates/${templateId}`));
  if (!template.exists()) return null;
  const version = await getDoc(doc(db, `users/${uid}/templates/${templateId}/versions/${template.get("currentVersionId")}`));
  if (!version.exists()) return null;
  return {
    archived: template.get("archived") === true,
    versionNumber: Number(template.get("currentVersionNumber") ?? 0),
    draft: {
      name: String(version.get("name") ?? ""),
      description: String(version.get("description") ?? ""),
      fields: version.get("fields") ?? [],
      revisitRule: version.get("revisitRule") ?? { enabled: false, daysAfterVisit: 14, leadDays: 3 },
    },
  };
}

export async function ensureDefaultTemplate(uid: string) {
  const existing = await getDocFromServer(doc(getFirebase().db, `users/${uid}/templates/${DEFAULT_TEMPLATE_ID}`));
  if (existing.exists()) return;
  await saveTemplate(uid, DEFAULT_TEMPLATE_ID, {
    ...STARTER_TEMPLATE,
    fields: STARTER_TEMPLATE.fields.map((field) => ({ ...field, options: field.options.map((option) => ({ ...option })), reminderRule: field.reminderRule ? { ...field.reminderRule } : null })),
    revisitRule: { ...STARTER_TEMPLATE.revisitRule },
  });
}

export async function setTemplateArchived(uid: string, templateId: string, archived: boolean) {
  const path = `users/${uid}/templates/${templateId}`;
  await commitAndConfirm(path, () => updateDoc(doc(getFirebase().db, path), { archived, updatedAt: serverTimestamp() }));
}

export async function setAccountTemplates(uid: string, accountId: string, templateIds: string[], defaultTemplateId: string | null) {
  const db = getFirebase().db;
  const existing = await getDocs(query(collection(db, `users/${uid}/accountTemplateLinks`), where("accountId", "==", accountId)));
  const batch = writeBatch(db);
  const pending = new Set(templateIds);
  for (const link of existing.docs) {
    const templateId = String(link.get("templateId"));
    if (pending.has(templateId)) pending.delete(templateId);
    else batch.delete(link.ref);
  }
  for (const templateId of pending) {
    batch.set(doc(db, `users/${uid}/accountTemplateLinks/${linkDocId(accountId, templateId)}`), {
      accountId,
      templateId,
      createdAt: serverTimestamp(),
    });
  }
  const fallback = defaultTemplateId && templateIds.includes(defaultTemplateId) ? defaultTemplateId : (templateIds[0] ?? null);
  batch.update(doc(db, `users/${uid}/accounts/${accountId}`), {
    templateIds,
    defaultTemplateId: fallback,
    updatedAt: serverTimestamp(),
  });
  await batch.commit();
  await getDocFromServer(doc(db, `users/${uid}/accounts/${accountId}`));
}

export type { TemplateField };
