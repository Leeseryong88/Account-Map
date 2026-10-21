"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { collection, deleteDoc, doc, getDoc, getDocs, limit, onSnapshot, orderBy, query, serverTimestamp, setDoc, where } from "firebase/firestore";
import { BellRing, Building2, Check, Clock, CloudCheck, History, NotebookPen, Trash2, UserRound } from "lucide-react";
import { validateAnswers } from "@shared/answers";
import { formatDateInSeoul, isoToSeoulInput, seoulDateTimeToIso } from "@shared/dates";
import { fieldReminderDocId, revisitDocId, revisitStateId, visitDocId } from "@shared/ids";
import { createId } from "@shared/ids";
import { planVisitEffects, visibleReminderChanges } from "@shared/planVisit";
import { DEFAULT_TEMPLATE_ID } from "@shared/starterTemplate";
import { autoFillFor } from "@shared/templateDraft";
import type { AnswerValue, TemplateField, TemplateSnapshot } from "@shared/types";
import { describeChange } from "@/lib/format";
import { useAuth } from "@/lib/auth";
import { callDeleteVisit, callSaveVisit, callableErrorMessage } from "@/lib/callables";
import { useData } from "@/lib/data";
import { getFirebase } from "@/lib/firebase";
import { useKeyboardInset } from "@/lib/hooks";
import { contactFromDoc, reminderFromDoc, type AccountRecord, type ContactRecord } from "@/lib/records";
import { previewLatest } from "@shared/visits";
import { confirmLeave, setUnsaved } from "@/lib/unsaved";
import { Modal, useToast } from "./Providers";
import { TemplateFields } from "./TemplateFields";
import { Button, Field, SelectInput, Switch, TextArea, TextInput } from "./ui";

interface FormState {
  visitedAtLocal: string;
  summary: string;
  contactIds: string[];
  templateId: string | null;
  answers: Record<string, AnswerValue>;
  copiedDateFields: string[];
}

export function VisitForm({ accountId, visitId, presentation = "page", onDone }: { accountId: string; visitId?: string; presentation?: "page" | "modal"; onDone?: () => void }) {
  const { user } = useAuth();
  const { accounts, templates, reminders, loading } = useData();
  const account = accounts.find((item) => item.id === accountId);
  const router = useRouter();
  const toast = useToast();
  useKeyboardInset();
  const requestId = useRef(createId("req"));
  const [form, setForm] = useState<FormState>({
    visitedAtLocal: isoToSeoulInput(new Date().toISOString()),
    summary: "",
    contactIds: [],
    templateId: null,
    answers: {},
    copiedDateFields: [],
  });
  const [snapshot, setSnapshot] = useState<TemplateSnapshot | null>(null);
  const [contacts, setContacts] = useState<ContactRecord[]>([]);
  const [anchors, setAnchors] = useState<{ latestVisitId: string | null; latestVisitAt: string | null; previousVisitId: string | null; previousVisitAt: string | null; lastCompletedSourceVisitAt: string | null }>({
    latestVisitId: null, latestVisitAt: null, previousVisitId: null, previousVisitAt: null, lastCompletedSourceVisitAt: null,
  });
  const [existingReminders, setExistingReminders] = useState<Array<{ id: string; fieldId: string; status: "open" | "done" | "cancelled"; dueAt: string; title: string; allDay: boolean; leadDays: number }>>([]);
  const [ready, setReady] = useState(false);
  const [draftNote, setDraftNote] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const [missing, setMissing] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [cancelLinked, setCancelLinked] = useState(true);
  const templateTouched = useRef(false);
  const silentUpdate = useRef(false);

  useEffect(() => {
    if (!user) return;
    return onSnapshot(
      query(collection(getFirebase().db, `users/${user.uid}/contacts`), where("accountId", "==", accountId)),
      (snap) => setContacts(snap.docs.map((item) => contactFromDoc(item.id, item.data()))),
    );
  }, [user, accountId]);

  useEffect(() => {
    const currentUser = user;
    if (!currentUser) return;
    const uid = currentUser.uid;
    let cancel = false;
    async function load() {
      const db = getFirebase().db;
      if (visitId) {
        const snap = await getDoc(doc(db, `users/${uid}/visits/${visitId}`));
        if (!snap.exists() || snap.get("deleted") === true || snap.get("accountId") !== accountId) {
          if (!cancel) setMissing(true);
        } else if (!cancel) {
          const visitedAt = snap.get("visitedAt")?.toDate?.().toISOString?.() ?? new Date().toISOString();
          setForm({
            visitedAtLocal: isoToSeoulInput(visitedAt),
            summary: String(snap.get("summary") ?? ""),
            contactIds: Array.isArray(snap.get("contacts")) ? snap.get("contacts").map((contact: { contactId: string }) => contact.contactId) : [],
            templateId: snap.get("templateId") ?? null,
            answers: snap.get("answers") ?? {},
            copiedDateFields: [],
          });
          setSnapshot(snap.get("formSnapshot") ?? null);
        }
      }
      const draftRef = doc(db, `users/${uid}/drafts/${accountId}__${visitId ?? "new"}`);
      const localKey = `salesmap:draft:${uid}:${accountId}:${visitId ?? "new"}`;
      const local = localStorage.getItem(localKey);
      const server = local ? null : await getDoc(draftRef).catch(() => null);
      const payload = local ? JSON.parse(local) : server?.data()?.payload;
      if (!cancel && payload?.visitedAtLocal) {
        setForm(payload);
        setDraftNote("작성 중이던 초안을 불러왔습니다.");
      }
      if (!cancel) setReady(true);
    }
    void load();
    return () => { cancel = true; };
  }, [user, accountId, visitId]);

  useEffect(() => {
    if (!ready || !user || visitId || templateTouched.current || !account) return;
    const active = templates.filter((template) => !template.archived);
    const linked = account.templateIds.filter((id) => active.some((template) => template.id === id));
    let next = linked.length === 1 ? linked[0] : (account.defaultTemplateId && linked.includes(account.defaultTemplateId) ? account.defaultTemplateId : null);
    if (!next && linked.length === 0) {
      next = active.some((template) => template.id === DEFAULT_TEMPLATE_ID) ? DEFAULT_TEMPLATE_ID : active.length === 1 ? active[0].id : null;
    }
    if (next) {
      setForm((current) => {
        if (current.templateId) return current;
        silentUpdate.current = true;
        return { ...current, templateId: next };
      });
    }
  }, [ready, user, visitId, account, templates]);

  const autoFilledFor = useRef<string | null>(null);
  useEffect(() => {
    if (!ready || visitId || !snapshot || !account) return;
    const key = `${snapshot.templateId}:${snapshot.versionId}`;
    if (autoFilledFor.current === key) return;
    autoFilledFor.current = key;
    const values = autoFillValues(snapshot.fields, account);
    setForm((current) => {
      const answers = { ...current.answers };
      let changed = false;
      for (const [id, value] of Object.entries(values)) {
        if (answers[id] == null || answers[id] === "") {
          answers[id] = value;
          changed = true;
        }
      }
      if (!changed) return current;
      silentUpdate.current = true;
      return { ...current, answers };
    });
  }, [ready, visitId, snapshot, account]);

  useEffect(() => {
    if (!user || visitId) return;
    if (!form.templateId) {
      setSnapshot(null);
      return;
    }
    const template = templates.find((item) => item.id === form.templateId);
    if (!template?.currentVersionId) return;
    void getDoc(doc(getFirebase().db, `users/${user.uid}/templates/${template.id}/versions/${template.currentVersionId}`)).then((snap) => {
      if (!snap.exists()) return;
      setSnapshot({
        templateId: template.id,
        versionId: template.currentVersionId,
        versionNumber: Number(snap.get("versionNumber") ?? template.currentVersionNumber),
        name: String(snap.get("name") ?? template.name),
        description: String(snap.get("description") ?? ""),
        fields: snap.get("fields") ?? [],
        revisitRule: snap.get("revisitRule") ?? template.revisitRule,
      });
    });
  }, [user, form.templateId, visitId, templates]);

  useEffect(() => {
    if (!user || !form.templateId) return;
    void getDoc(doc(getFirebase().db, `users/${user.uid}/revisitStates/${revisitStateId(accountId, form.templateId)}`)).then((snap) => {
      if (!snap.exists()) return;
      const iso = (value: unknown) => value && typeof value === "object" && "toDate" in value ? (value as { toDate: () => Date }).toDate().toISOString() : null;
      setAnchors({
        latestVisitId: snap.get("latestVisitId") ?? null,
        latestVisitAt: iso(snap.get("latestVisitAt")),
        previousVisitId: snap.get("previousVisitId") ?? null,
        previousVisitAt: iso(snap.get("previousVisitAt")),
        lastCompletedSourceVisitAt: iso(snap.get("lastCompletedSourceVisitAt")),
      });
    });
  }, [user, accountId, form.templateId]);

  useEffect(() => {
    if (!user || !visitId || !snapshot) return;
    const ids = snapshot.fields.filter((field) => field.reminderRule).map((field) => fieldReminderDocId(visitId, field.id));
    void Promise.all(ids.map((id) => getDoc(doc(getFirebase().db, `users/${user.uid}/reminders/${id}`)))).then((snaps) => {
      setExistingReminders(snaps.filter((snap) => snap.exists()).map((snap) => ({
        id: snap.id,
        fieldId: String(snap.get("fieldId") ?? ""),
        status: snap.get("status"),
        dueAt: snap.get("dueAt").toDate().toISOString(),
        title: String(snap.get("title") ?? ""),
        allDay: snap.get("allDay") === true,
        leadDays: Number(snap.get("leadDays") ?? 0),
      })));
    });
  }, [user, visitId, snapshot]);

  useEffect(() => {
    if (!ready || !user) return;
    const handle = window.setTimeout(() => {
      const key = `salesmap:draft:${user.uid}:${accountId}:${visitId ?? "new"}`;
      localStorage.setItem(key, JSON.stringify(form));
      void setDoc(doc(getFirebase().db, `users/${user.uid}/drafts/${accountId}__${visitId ?? "new"}`), {
        accountId,
        visitId: visitId ?? "new",
        payload: JSON.parse(JSON.stringify(form)),
        updatedAt: serverTimestamp(),
      }).catch(() => undefined);
      setDraftNote("초안 저장됨");
    }, 500);
    return () => window.clearTimeout(handle);
  }, [form, ready, user, accountId, visitId]);

  const formReady = useRef(false);
  useEffect(() => {
    if (!ready) return;
    if (!formReady.current) {
      formReady.current = true;
      return;
    }
    if (silentUpdate.current) {
      silentUpdate.current = false;
      return;
    }
    setUnsaved(true);
    const onBefore = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", onBefore);
    return () => {
      setUnsaved(false);
      window.removeEventListener("beforeunload", onBefore);
    };
  }, [form, ready]);

  const fields = snapshot?.fields ?? [];
  const plannedVisitId = visitId ?? visitDocId(requestId.current);
  const latest = useMemo(() => previewLatest({
    thisVisitId: visitId ?? null,
    thisVisitedAt: safeIso(form.visitedAtLocal),
    latestVisitId: anchors.latestVisitId,
    latestVisitAt: anchors.latestVisitAt,
    previousVisitId: anchors.previousVisitId,
    previousVisitAt: anchors.previousVisitAt,
  }), [visitId, form.visitedAtLocal, anchors]);
  const openRevisit = reminders.find((reminder) => reminder.type === "revisit" && reminder.templateId === form.templateId && reminder.accountId === accountId);
  const changes = useMemo(() => {
    if (!snapshot) return [];
    const thisIsLatest = !openRevisit || latest?.id === (visitId ?? "new") || latest?.id === plannedVisitId;
    return visibleReminderChanges(planVisitEffects({
      visitId: plannedVisitId,
      visitedAt: safeIso(form.visitedAtLocal),
      templateId: form.templateId,
      templateName: snapshot.name,
      fields,
      revisitRule: thisIsLatest ? snapshot.revisitRule : null,
      answers: form.answers,
      existingFieldReminders: existingReminders,
      openRevisit: openRevisit ? {
        id: openRevisit.id,
        dueAt: openRevisit.dueAt,
        sourceVisitAt: openRevisit.sourceVisitAt ?? openRevisit.dueAt,
        visitId: openRevisit.visitId,
        title: openRevisit.title,
        leadDays: openRevisit.leadDays,
        allDay: true,
      } : null,
      lastCompletedSourceVisitAt: anchors.lastCompletedSourceVisitAt,
      latestVisitAt: latest?.visitedAt ?? null,
      latestVisitId: latest?.id === "new" ? plannedVisitId : latest?.id ?? null,
      newRevisitId: revisitDocId(requestId.current),
    }));
  }, [snapshot, openRevisit, latest, visitId, plannedVisitId, form, fields, existingReminders, anchors.lastCompletedSourceVisitAt]);

  async function importPrevious() {
    if (!user || !form.templateId) return;
    if (Object.values(form.answers).some((value) => value != null && value !== "") && !window.confirm("입력 중인 내용을 이전 기록으로 바꿀까요?")) return;
    const snap = await getDocs(query(
      collection(getFirebase().db, `users/${user.uid}/visits`),
      where("accountId", "==", accountId),
      where("templateId", "==", form.templateId),
      where("deleted", "==", false),
      orderBy("visitedAt", "desc"),
      limit(2),
    ));
    const source = snap.docs.find((item) => item.id !== visitId);
    if (!source) {
      toast("불러올 이전 기록이 없습니다.", "error");
      return;
    }
    const answers = (source.get("answers") ?? {}) as Record<string, AnswerValue>;
    const known = new Set(fields.map((field) => field.id));
    const copied: Record<string, AnswerValue> = {};
    const copiedDates: string[] = [];
    const fresh = visitId
      ? Object.fromEntries(fields.filter((field) => autoFillFor(field)).map((field) => [field.id, form.answers[field.id] ?? null]))
      : account ? autoFillValues(fields, account) : {};
    Object.entries(answers).forEach(([id, value]) => {
      if (!known.has(id)) return;
      if (id in fresh) return;
      copied[id] = value;
      const field = fields.find((item) => item.id === id);
      if ((field?.type === "date" || field?.type === "datetime") && value) copiedDates.push(id);
    });
    Object.assign(copied, fresh);
    setForm((current) => ({ ...current, answers: copied, summary: String(source.get("summary") ?? current.summary), copiedDateFields: copiedDates }));
    toast("이전 방문의 내용을 불러왔습니다. 날짜 항목은 과거 값이 그대로 들어 있습니다.");
  }

  async function save() {
    if (!user) return;
    const checked = validateAnswers(fields, form.answers);
    const nextErrors = { ...checked.errors };
    if (!form.visitedAtLocal) nextErrors.visitedAt = "방문 일시를 입력해 주세요.";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    setPending(true);
    try {
      await callSaveVisit({
        clientRequestId: requestId.current,
        visitId: visitId ?? null,
        accountId,
        visitedAt: seoulDateTimeToIso(form.visitedAtLocal),
        summary: form.summary,
        contactIds: form.contactIds,
        templateId: visitId ? null : form.templateId,
        answers: checked.normalized,
      });
      localStorage.removeItem(`salesmap:draft:${user.uid}:${accountId}:${visitId ?? "new"}`);
      await deleteDoc(doc(getFirebase().db, `users/${user.uid}/drafts/${accountId}__${visitId ?? "new"}`)).catch(() => undefined);
      setUnsaved(false);
      toast("방문 기록을 저장했습니다.");
      if (onDone) onDone();
      else router.push(`/map?account=${accountId}`);
    } catch (error) {
      toast(callableErrorMessage(error), "error");
    } finally {
      setPending(false);
    }
  }

  async function remove() {
    if (!visitId) return;
    setPending(true);
    try {
      await callDeleteVisit({ clientRequestId: createId("req"), visitId, cancelLinkedFieldReminders: cancelLinked });
      setUnsaved(false);
      toast("방문 기록을 삭제했습니다.");
      if (onDone) onDone();
      else router.push(`/map?account=${accountId}`);
    } catch (error) {
      toast(callableErrorMessage(error), "error");
    } finally {
      setPending(false);
    }
  }

  if (loading) return <p className="p-6 text-subtle">거래처를 불러오는 중</p>;
  if (!account) return <p className="p-6">거래처를 찾을 수 없습니다.</p>;
  if (missing) return <p className="p-6">삭제되었거나 찾을 수 없는 방문 기록입니다.</p>;
  const linkedTemplates = templates.filter((template) => account.templateIds.includes(template.id) && !template.archived);
  const templateChoices = linkedTemplates.length ? linkedTemplates : templates.filter((template) => !template.archived);
  const activeContacts = contacts.filter((contact) => contact.active || form.contactIds.includes(contact.id));
  const nowLocal = isoToSeoulInput(new Date().toISOString());
  const todayLocal = nowLocal.slice(0, 10);

  const modal = presentation === "modal";

  return (
    <div className={modal ? "flex min-h-0 flex-1 flex-col" : "flex h-full min-h-0 flex-col"}>
      {modal ? null : (
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-line bg-white px-4 py-3">
          <div className="min-w-0">
            <h1 className="text-lg font-bold">{visitId ? "방문 기록" : "방문 기록 작성"}</h1>
            <p className="flex items-center gap-1 truncate text-sm text-subtle"><Building2 className="size-3.5 shrink-0" aria-hidden="true" />{account.name}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {draftNote ? <span className="badge hidden sm:inline-flex" role="status"><CloudCheck className="size-3.5" aria-hidden="true" />{draftNote}</span> : null}
            {visitId ? <Button type="button" size="sm" variant="danger" onClick={() => setDeleteOpen(true)}><Trash2 aria-hidden="true" />삭제</Button> : null}
          </div>
        </header>
      )}
      <div className="min-h-0 flex-1 overflow-auto bg-bg">
        <div className="mx-auto grid max-w-2xl gap-4 p-4 pb-8">
          {modal && (draftNote || visitId) ? (
            <div className="flex items-center justify-between gap-2">
              {draftNote ? <span className="badge" role="status"><CloudCheck className="size-3.5" aria-hidden="true" />{draftNote}</span> : <span />}
              {visitId ? <Button type="button" size="sm" variant="danger" onClick={() => setDeleteOpen(true)}><Trash2 aria-hidden="true" />삭제</Button> : null}
            </div>
          ) : null}
          {visitId && snapshot ? <p className="rounded-xl bg-[#eef1f6] px-3 py-2 text-[13px] text-muted">작성할 때의 양식 “{snapshot.name}” 그대로 보여 드립니다. 템플릿을 고쳐도 이 기록은 바뀌지 않습니다.</p> : null}

          <section className="card grid gap-5 p-4 sm:p-5">
            <h2 className="flex items-center gap-2 font-bold"><Clock className="size-[18px] text-primary" aria-hidden="true" />언제, 누구를 만났나요?</h2>
            <Field id="visited-at" label="방문 일시" required error={errors.visitedAt}>
              {(aria) => (
                <div className="flex flex-wrap gap-2">
                  <TextInput {...aria} type="datetime-local" className="min-w-0 flex-1 sm:max-w-72" max={`${todayLocal}T23:59`} value={form.visitedAtLocal} onChange={(event) => setForm({ ...form, visitedAtLocal: event.target.value })} />
                  <Button type="button" variant="secondary" onClick={() => setForm({ ...form, visitedAtLocal: nowLocal })}>지금</Button>
                </div>
              )}
            </Field>
            <fieldset className="grid gap-2">
              <legend className="mb-2 text-sm font-semibold">만난 담당자 <span className="font-normal text-subtle">(선택)</span></legend>
              {activeContacts.length === 0 ? (
                <p className="text-[13px] text-subtle">등록된 담당자가 없습니다. 담당자는 거래처 화면의 ‘담당자’ 탭에서 추가할 수 있습니다.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {activeContacts.map((contact) => {
                    const checked = form.contactIds.includes(contact.id);
                    return (
                      <button key={contact.id} type="button" className="chip" aria-pressed={checked} onClick={() => setForm({ ...form, contactIds: checked ? form.contactIds.filter((id) => id !== contact.id) : [...form.contactIds, contact.id] })}>
                        {checked ? <Check aria-hidden="true" /> : <UserRound aria-hidden="true" />}
                        {contact.name}
                        {contact.role ? <span className="font-normal text-subtle">{contact.role}</span> : null}
                        {!contact.active ? <span className="font-normal text-subtle">(비활성)</span> : null}
                      </button>
                    );
                  })}
                </div>
              )}
            </fieldset>
          </section>

          <section className="card grid gap-5 p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 font-bold"><NotebookPen className="size-[18px] text-primary" aria-hidden="true" />방문 내용</h2>
              {fields.length > 0 ? <Button type="button" size="sm" variant="ghost" className="text-primary" onClick={importPrevious}><History aria-hidden="true" />지난 기록 불러오기</Button> : null}
            </div>
            {!visitId ? (
              <div className="grid gap-1.5">
                <label htmlFor="template" className="text-sm font-semibold">템플릿</label>
                <SelectInput id="template" value={form.templateId ?? ""} onChange={(event) => { templateTouched.current = true; autoFilledFor.current = null; setForm({ ...form, templateId: event.target.value || null, answers: {} }); }}>
                  <option value="">템플릿 없이 기록</option>
                  {templateChoices.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
                </SelectInput>
                <p className="text-[13px] text-subtle">
                  템플릿은 <Link href="/templates" className="font-semibold text-primary underline-offset-2 hover:underline" onClick={(event) => { if (!confirmLeave()) event.preventDefault(); }}>템플릿 화면</Link>에서 내 방식대로 고칠 수 있습니다.
                </p>
              </div>
            ) : null}
            {fields.length > 0 ? (
              <div className="border-t border-line pt-5">
                <TemplateFields fields={fields} values={form.answers} errors={errors} copiedDateFields={form.copiedDateFields} onChange={(fieldId, value) => setForm({ ...form, answers: { ...form.answers, [fieldId]: value }, copiedDateFields: form.copiedDateFields.filter((id) => id !== fieldId) })} />
              </div>
            ) : null}
            <Field id="summary" label={fields.length ? "한 줄 요약" : "방문 내용"} help={fields.length ? "목록에 먼저 보이는 문장입니다. 비워 두면 메모 내용이 대신 보입니다." : undefined}>
              {(aria) => <TextArea {...aria} className={fields.length ? "min-h-20" : ""} placeholder={fields.length ? "(선택) 예: 신제품 샘플 전달, 다음 주 견적 요청" : "나눈 이야기와 다음에 할 일을 적어 주세요."} value={form.summary} onChange={(event) => setForm({ ...form, summary: event.target.value })} />}
            </Field>
          </section>
        </div>
      </div>
      <footer className="shrink-0 border-t border-line bg-white px-4 py-3 pb-safe" style={{ marginBottom: "var(--keyboard-inset)" }}>
        <div className="mx-auto grid max-w-2xl gap-2">
          {changes.length > 0 ? (
            <ul className="grid gap-1 rounded-xl bg-warn-soft px-3 py-2 text-[13px] text-[#7c4a03]">
              {changes.map((change) => <li key={`${change.reminderId}-${change.action}`} className="flex items-start gap-1.5"><BellRing className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />{describeChange(change)}</li>)}
            </ul>
          ) : null}
          <Button type="button" variant="primary" className="h-12 w-full text-base" disabled={pending} aria-busy={pending} onClick={save}>{pending ? "저장 중" : visitId ? "변경 저장" : "방문 기록 저장"}</Button>
        </div>
      </footer>
      <Modal open={deleteOpen} title="방문 기록 삭제" description={`${account.name}의 이 방문 기록을 삭제합니다. 최근 방문일과 방문 횟수는 남은 기록으로 다시 계산됩니다.`} onOpenChange={setDeleteOpen}>
        <label className="flex min-h-12 items-center justify-between gap-3 rounded-xl border border-line px-4">
          <span className="text-sm font-medium">이 기록으로 만든 남은 알림도 취소</span>
          <Switch checked={cancelLinked} onCheckedChange={setCancelLinked} />
        </label>
        <p className="mt-3 text-[13px] text-subtle">재방문 알림은 남은 방문 중 가장 최근 날짜로 다시 계산합니다. 남은 방문이 없으면 재방문 알림도 취소됩니다. 다른 기록의 알림과 직접 추가한 알림은 그대로입니다.</p>
        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => setDeleteOpen(false)}>취소</Button>
          <Button type="button" variant="danger" disabled={pending} onClick={remove}>삭제하기</Button>
        </div>
      </Modal>
    </div>
  );
}

function safeIso(localValue: string) {
  try { return seoulDateTimeToIso(localValue); } catch { return new Date().toISOString(); }
}

function autoFillValues(fields: TemplateField[], account: AccountRecord): Record<string, AnswerValue> {
  const values: Record<string, AnswerValue> = {};
  for (const field of fields) {
    const source = autoFillFor(field);
    if (source === "accountName") values[field.id] = account.name;
    if (source === "lastVisitDate") values[field.id] = account.lastVisitAt ? formatDateInSeoul(new Date(account.lastVisitAt)) : null;
  }
  return values;
}

export type { TemplateField };
