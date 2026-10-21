"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { clsx } from "clsx";
import { collection, limit, onSnapshot, orderBy, query, startAfter, where, type QueryDocumentSnapshot } from "firebase/firestore";
import { Archive, ArchiveRestore, BellPlus, CalendarClock, ChevronRight, Mail, MapPin, MoreHorizontal, Pencil, Phone, PenLine, Plus, Star, UserRound, X } from "lucide-react";
import { z } from "zod";
import { formatAnswer } from "@shared/answers";
import { addSeoulDays, formatKoreanDateTime } from "@shared/dates";
import { LIMITS, SALES_STATUSES, type AnswerValue, type TemplateSnapshot } from "@shared/types";
import { SALES_STATUS_LABEL, TIME_STATUS_LABEL, visitLabel } from "@shared/labels";
import { getReminderTimeStatus } from "@shared/reminderStatus";
import { visitTone } from "@shared/visitBands";
import { useAuth } from "@/lib/auth";
import { callCreateManualReminder, callSetAccountArchived, callableErrorMessage } from "@/lib/callables";
import { useData } from "@/lib/data";
import { getFirebase } from "@/lib/firebase";
import { reminderWhen, telHref } from "@/lib/format";
import { useNow } from "@/lib/hooks";
import { contactFromDoc, reminderFromDoc, type AccountRecord, type ContactRecord, type ReminderRecord } from "@/lib/records";
import { TONE_COLOR } from "@/lib/tones";
import { createId } from "@shared/ids";
import { saveContact, setAccountTemplates } from "@/lib/writes";
import { Modal, useToast } from "./Providers";
import { Button, Field, IconButton, Switch, TextArea, TextInput } from "./ui";

const STATUS_BADGE: Record<string, string> = {
  overdue: "badge-danger",
  today: "badge-primary",
  soon: "badge-warn",
  scheduled: "",
};

function useAccountFacts(account: AccountRecord) {
  const { reminders, bands } = useData();
  const now = useNow();
  const tone = visitTone(account.lastVisitAt, bands, now);
  const open = reminders.filter((reminder) => reminder.accountId === account.id);
  const next = open.slice().sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt))[0];
  const nextStatus = next ? getReminderTimeStatus({ dueAt: next.dueAt, allDay: next.allDay, leadDays: next.leadDays, now }) : null;
  return { tone, next, nextStatus };
}

function AccountFacts({ account }: { account: AccountRecord }) {
  const { tone, next, nextStatus } = useAccountFacts(account);
  return (
    <ul className="grid gap-1.5 text-sm">
      {account.address ? (
        <li className="flex items-start gap-2 text-muted"><MapPin className="mt-0.5 size-4 shrink-0 text-subtle" aria-hidden="true" />{account.address}</li>
      ) : null}
      <li className="flex items-center gap-2">
        <span className="ml-1 mr-0.5 size-2.5 shrink-0 rounded-full" style={{ background: TONE_COLOR[tone.tone] }} />
        <span className="font-semibold" style={{ color: TONE_COLOR[tone.tone] }}>{visitLabel(tone.days)}</span>
        {account.visitCount > 0 ? <span className="text-subtle">· 총 {account.visitCount}회 방문</span> : null}
      </li>
      <li className="flex items-center gap-2">
        <CalendarClock className="size-4 shrink-0 text-subtle" aria-hidden="true" />
        {next ? (
          <span className="flex flex-wrap items-center gap-1.5">
            <span>{next.title} · {reminderWhen(next)}</span>
            {nextStatus && nextStatus !== "scheduled" ? <span className={clsx("badge", STATUS_BADGE[nextStatus])}>{TIME_STATUS_LABEL[nextStatus]}</span> : null}
          </span>
        ) : <span className="text-subtle">예정된 알림 없음</span>}
      </li>
    </ul>
  );
}

export function AccountSummary({ account, onWriteVisit, onClose }: { account: AccountRecord; onWriteVisit: () => void; onClose?: () => void }) {
  return (
    <div className="grid gap-3 px-4 pb-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-bold leading-7">{account.name}</h2>
          <span className="badge mt-0.5">{SALES_STATUS_LABEL[account.salesStatus]}</span>
        </div>
        {onClose ? <IconButton label="닫기" variant="ghost" size="sm" onClick={onClose}><X aria-hidden="true" /></IconButton> : null}
      </div>
      <AccountFacts account={account} />
      <Button type="button" variant="primary" onClick={onWriteVisit}><PenLine aria-hidden="true" />방문 기록 작성</Button>
    </div>
  );
}

type VisitItem = { id: string; visitedAt: string; summary: string; contacts: Array<{ name: string }>; templateName: string | null; snapshot: TemplateSnapshot | null; answers: Record<string, AnswerValue> };

function visitHighlights(visit: VisitItem) {
  const fields = visit.snapshot?.fields ?? [];
  const tag = fields.find((field) => field.type === "single" && visit.answers[field.id] != null);
  const memo = fields.find((field) => (field.type === "textarea" || field.type === "text") && !field.autoFill && typeof visit.answers[field.id] === "string" && visit.answers[field.id]);
  return {
    tag: tag ? formatAnswer(tag, visit.answers[tag.id] ?? null) : null,
    text: visit.summary || (memo ? String(visit.answers[memo.id]) : ""),
  };
}

export function AccountPanel({ account, onClose, onWriteVisit, refreshKey = 0 }: { account: AccountRecord; onClose: () => void; onWriteVisit: () => void; refreshKey?: number }) {
  const { user } = useAuth();
  const { templates } = useData();
  const toast = useToast();
  const router = useRouter();
  const [tab, setTab] = useState<"visits" | "contacts" | "info">("visits");
  const [visits, setVisits] = useState<VisitItem[]>([]);
  const [cursor, setCursor] = useState<QueryDocumentSnapshot | null>(null);
  const [visitDone, setVisitDone] = useState(false);
  const [visitsLoaded, setVisitsLoaded] = useState(false);
  const [visitError, setVisitError] = useState("");
  const [contacts, setContacts] = useState<ContactRecord[]>([]);
  const [accountReminders, setAccountReminders] = useState<ReminderRecord[]>([]);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [cancelReminders, setCancelReminders] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [contactDraft, setContactDraft] = useState<ContactRecord | null>(null);
  const phoneHref = telHref(account.phone);

  useEffect(() => {
    if (!user) return;
    const db = getFirebase().db;
    const unsubContacts = onSnapshot(query(collection(db, `users/${user.uid}/contacts`), where("accountId", "==", account.id)), (snap) => {
      setContacts(snap.docs.map((item) => contactFromDoc(item.id, item.data())).sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || a.name.localeCompare(b.name, "ko")));
    });
    const unsubReminders = onSnapshot(query(collection(db, `users/${user.uid}/reminders`), where("accountId", "==", account.id), limit(100)), (snap) => {
      setAccountReminders(snap.docs.flatMap((item) => {
        const reminder = reminderFromDoc(item.id, item.data());
        return reminder ? [reminder] : [];
      }));
    });
    return () => { unsubContacts(); unsubReminders(); };
  }, [user, account.id]);

  useEffect(() => {
    setVisits([]);
    setCursor(null);
    setVisitDone(false);
    setVisitsLoaded(false);
    setContactDraft(null);
    void loadVisits(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account.id, user?.uid, refreshKey]);

  async function loadVisits(reset = false) {
    if (!user) return;
    try {
      const constraints = [
        where("accountId", "==", account.id),
        where("deleted", "==", false),
        orderBy("visitedAt", "desc"),
        limit(LIMITS.visitsPage),
      ] as const;
      const snap = await import("firebase/firestore").then(({ getDocs }) => getDocs(query(
        collection(getFirebase().db, `users/${user.uid}/visits`),
        ...constraints.slice(0, 3),
        ...(reset || !cursor ? [] : [startAfter(cursor)]),
        constraints[3],
      )));
      const next = snap.docs.map((item) => ({
        id: item.id,
        visitedAt: item.get("visitedAt")?.toDate?.().toISOString?.() ?? "",
        summary: String(item.get("summary") ?? ""),
        contacts: Array.isArray(item.get("contacts")) ? item.get("contacts") : [],
        templateName: item.get("templateName") ?? null,
        snapshot: item.get("formSnapshot") ?? null,
        answers: item.get("answers") ?? {},
      }));
      setVisits((current) => reset ? next : [...current, ...next]);
      setCursor(snap.docs.at(-1) ?? null);
      setVisitDone(snap.size < LIMITS.visitsPage);
      setVisitError("");
    } catch {
      setVisitError("방문 기록을 불러오지 못했습니다. Firestore 인덱스를 배포했는지 확인해 주세요.");
    } finally {
      setVisitsLoaded(true);
    }
  }

  async function archive() {
    try {
      await callSetAccountArchived({ accountId: account.id, archived: !account.archived, cancelOpenReminders: account.archived ? false : cancelReminders });
      toast(account.archived ? "보관을 해제했습니다." : "거래처를 보관했습니다.");
      setArchiveOpen(false);
      if (!account.archived) onClose();
    } catch (error) {
      toast(callableErrorMessage(error), "error");
    }
  }

  const activeContacts = contacts.filter((contact) => contact.active).length;
  const tabs = [
    { id: "visits" as const, label: "방문 기록", count: visits.length && visitDone ? visits.length : null },
    { id: "contacts" as const, label: "담당자", count: activeContacts || null },
    { id: "info" as const, label: "정보", count: null },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col bg-white">
      <div className="shrink-0 border-b border-line px-4 pb-3 pt-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 pt-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-bold leading-7">{account.name}</h2>
              <span className="badge">{SALES_STATUS_LABEL[account.salesStatus]}</span>
              {account.archived ? <span className="badge badge-warn">보관됨</span> : null}
            </div>
            {account.industry ? <p className="mt-0.5 text-[13px] text-subtle">{account.industry}</p> : null}
          </div>
          <div className="flex shrink-0 items-center">
            <DropdownMenu.Root>
              <DropdownMenu.Trigger className="btn btn-ghost btn-icon" aria-label="더보기"><MoreHorizontal aria-hidden="true" /></DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content className="menu" align="end" sideOffset={4}>
                  <DropdownMenu.Item className="menu-item" onSelect={() => router.push(`/accounts/${account.id}/edit`)}><Pencil aria-hidden="true" />거래처 정보 수정</DropdownMenu.Item>
                  <DropdownMenu.Item className="menu-item" onSelect={() => setManualOpen(true)}><BellPlus aria-hidden="true" />알림 추가</DropdownMenu.Item>
                  <DropdownMenu.Separator className="my-1 h-px bg-line" />
                  <DropdownMenu.Item className="menu-item" onSelect={() => { setCancelReminders(false); setArchiveOpen(true); }}>
                    {account.archived ? <ArchiveRestore aria-hidden="true" /> : <Archive aria-hidden="true" />}{account.archived ? "보관 해제" : "보관하기"}
                  </DropdownMenu.Item>
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
            <IconButton label="닫기" variant="ghost" onClick={onClose}><X aria-hidden="true" /></IconButton>
          </div>
        </div>
        <div className="mt-2"><AccountFacts account={account} /></div>
        <div className="mt-3 flex gap-2">
          <Button type="button" variant="primary" className="flex-1" onClick={onWriteVisit}><PenLine aria-hidden="true" />방문 기록 작성</Button>
          {phoneHref ? <a href={phoneHref} className="btn btn-secondary"><Phone aria-hidden="true" />전화</a> : null}
          <IconButton label="알림 추가" onClick={() => setManualOpen(true)}><BellPlus aria-hidden="true" /></IconButton>
        </div>
      </div>
      <div className="flex shrink-0 gap-5 border-b border-line px-4" role="tablist">
        {tabs.map((item) => (
          <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} className="tab" onClick={() => setTab(item.id)}>
            {item.label}
            {item.count ? <span className="badge min-h-5 px-1.5">{item.count}</span> : null}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-auto bg-[#fafbfc] p-4">
        {tab === "visits" ? (
          <div className="grid gap-2.5">
            {visitError ? <p role="alert" className="text-sm text-danger">{visitError}</p> : null}
            {visitsLoaded && visits.length === 0 && !visitError ? (
              <div className="grid justify-items-center gap-2 rounded-xl border border-dashed border-line-strong bg-white px-4 py-8 text-center">
                <p className="font-semibold">아직 방문 기록이 없습니다</p>
                <p className="text-sm text-subtle">방문하고 나서 기록을 남기면 여기에 시간순으로 쌓입니다.</p>
                <Button type="button" size="sm" variant="soft" className="mt-1" onClick={onWriteVisit}><PenLine aria-hidden="true" />첫 방문 기록 작성</Button>
              </div>
            ) : null}
            {visits.map((visit) => {
              const linked = accountReminders.filter((reminder) => reminder.visitId === visit.id && reminder.status === "open");
              const highlight = visitHighlights(visit);
              return (
                <Link key={visit.id} href={`/accounts/${account.id}/visits/${visit.id}`} className="group block rounded-xl border border-line bg-white p-3.5 transition-colors hover:border-line-strong">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-bold">{visit.visitedAt ? formatKoreanDateTime(visit.visitedAt) : "날짜 없음"}</p>
                    <ChevronRight className="size-4 shrink-0 text-[#b3bcc9] group-hover:text-subtle" aria-hidden="true" />
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {highlight.tag ? <span className="badge badge-primary">{highlight.tag}</span> : null}
                    {visit.contacts.length ? <span className="badge"><UserRound className="size-3" aria-hidden="true" />{visit.contacts.map((contact) => contact.name).join(", ")}</span> : null}
                  </div>
                  {highlight.text ? <p className="mt-2 line-clamp-3 whitespace-pre-line text-sm text-muted">{highlight.text}</p> : null}
                  {linked.length > 0 ? (
                    <p className="mt-2 flex items-center gap-1.5 text-[13px] text-primary-ink">
                      <CalendarClock className="size-3.5" aria-hidden="true" />
                      {linked.map((reminder) => `${reminder.title} ${reminderWhen(reminder)}`).join(" · ")}
                    </p>
                  ) : null}
                </Link>
              );
            })}
            {!visitDone && visits.length > 0 ? <Button type="button" variant="secondary" onClick={() => loadVisits(false)}>이전 기록 더 보기</Button> : null}
          </div>
        ) : null}
        {tab === "contacts" ? (
          <ContactSection accountId={account.id} contacts={contacts} draft={contactDraft} setDraft={setContactDraft} />
        ) : null}
        {tab === "info" ? (
          <InfoSection account={account} templates={templates.filter((template) => !template.archived)} />
        ) : null}
      </div>
      <Modal open={archiveOpen} title={account.archived ? "보관 해제" : "거래처 보관"} description={account.archived ? "지도와 기본 목록에 다시 표시합니다." : "지도에서 숨깁니다. 담당자, 방문 기록, 알림 이력은 그대로 남습니다."} onOpenChange={setArchiveOpen}>
        {!account.archived ? (
          <label className="flex min-h-12 items-center justify-between gap-3 rounded-xl border border-line px-4">
            <span className="text-sm font-medium">남은 알림도 모두 취소</span>
            <Switch checked={cancelReminders} onCheckedChange={setCancelReminders} />
          </label>
        ) : null}
        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => setArchiveOpen(false)}>취소</Button>
          <Button type="button" variant="primary" onClick={archive}>{account.archived ? "보관 해제" : "보관하기"}</Button>
        </div>
      </Modal>
      <ManualReminderDialog open={manualOpen} accountId={account.id} onOpenChange={setManualOpen} />
    </div>
  );
}

function InfoSection({ account, templates }: { account: AccountRecord; templates: Array<{ id: string; name: string }> }) {
  const [selected, setSelected] = useState(account.templateIds);
  const [defaultId, setDefaultId] = useState(account.defaultTemplateId);
  const [pending, setPending] = useState(false);
  const toast = useToast();
  const { user } = useAuth();
  const router = useRouter();
  const phoneHref = telHref(account.phone);
  useEffect(() => {
    setSelected(account.templateIds);
    setDefaultId(account.defaultTemplateId);
  }, [account]);
  const dirty = selected.join() !== account.templateIds.join() || defaultId !== account.defaultTemplateId;

  async function save() {
    if (!user) return;
    setPending(true);
    try {
      await setAccountTemplates(user.uid, account.id, selected, defaultId);
      toast("사용할 템플릿을 저장했습니다.");
    } catch (error) {
      toast(callableErrorMessage(error), "error");
    } finally {
      setPending(false);
    }
  }

  const rows: Array<[string, React.ReactNode]> = [
    ["업종", account.industry || null],
    ["대표 전화", account.phone ? (phoneHref ? <a className="font-semibold text-primary" href={phoneHref}>{account.phone}</a> : account.phone) : null],
    ["태그", account.tags.length ? <span className="flex flex-wrap gap-1">{account.tags.map((tag) => <span key={tag} className="badge">#{tag}</span>)}</span> : null],
    ["메모", account.memo ? <span className="whitespace-pre-line">{account.memo}</span> : null],
  ];

  return (
    <div className="grid gap-4 text-sm">
      <section className="rounded-xl border border-line bg-white">
        <dl className="divide-y divide-line">
          {rows.map(([label, value]) => (
            <div key={label} className="grid grid-cols-[72px_minmax(0,1fr)] gap-3 px-4 py-3">
              <dt className="whitespace-nowrap text-subtle">{label}</dt>
              <dd>{value ?? <span className="text-[#9aa3b0]">없음</span>}</dd>
            </div>
          ))}
        </dl>
        <div className="border-t border-line p-2">
          <Button type="button" size="sm" variant="ghost" className="w-full" onClick={() => router.push(`/accounts/${account.id}/edit`)}><Pencil aria-hidden="true" />정보 수정</Button>
        </div>
      </section>
      <section className="grid gap-2 rounded-xl border border-line bg-white p-4">
        <div>
          <h3 className="font-bold">이 거래처에서 쓸 템플릿</h3>
          <p className="mt-0.5 text-[13px] text-subtle">고르지 않으면 방문 기록을 쓸 때 기본 템플릿이 자동으로 선택됩니다.</p>
        </div>
        {templates.length === 0 ? <p className="text-subtle">사용할 수 있는 템플릿이 없습니다.</p> : (
          <ul className="grid gap-1.5">
            {templates.map((template) => {
              const checked = selected.includes(template.id);
              const isDefault = defaultId === template.id;
              return (
                <li key={template.id} className={clsx("flex min-h-12 items-center gap-3 rounded-lg border px-3", checked ? "border-[#b9c9f5] bg-[#f5f8ff]" : "border-line")}>
                  <label className="flex flex-1 cursor-pointer items-center gap-3 py-2">
                    <input type="checkbox" className="size-4 accent-[var(--primary)]" checked={checked} onChange={() => {
                      const next = checked ? selected.filter((id) => id !== template.id) : [...selected, template.id];
                      setSelected(next);
                      if (!next.includes(defaultId ?? "")) setDefaultId(next[0] ?? null);
                    }} />
                    <span className="font-medium">{template.name}</span>
                  </label>
                  {checked && selected.length > 1 ? (
                    <button type="button" aria-pressed={isDefault} className={clsx("chip min-h-8 px-2.5 text-xs", isDefault ? "" : "text-subtle")} onClick={() => setDefaultId(template.id)}>
                      <Star className={clsx("size-3.5", isDefault ? "fill-current" : "")} aria-hidden="true" />{isDefault ? "먼저 선택" : "먼저 선택하기"}
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
        {dirty ? <Button type="button" variant="primary" disabled={pending} onClick={save}>{pending ? "저장 중" : "변경 저장"}</Button> : null}
      </section>
    </div>
  );
}

const contactSchema = z.object({
  name: z.string().trim().min(1, "이름을 입력해 주세요.").max(80),
  role: z.string().max(80),
  department: z.string().max(80),
  phone: z.string().max(40),
  email: z.string().max(200).refine((value) => value === "" || z.string().email().safeParse(value).success, "이메일 형식을 확인해 주세요."),
  memo: z.string().max(2000),
});

function ContactSection({ accountId, contacts, draft, setDraft }: { accountId: string; contacts: ContactRecord[]; draft: ContactRecord | null; setDraft: (contact: ContactRecord | null) => void }) {
  const { user } = useAuth();
  const toast = useToast();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const active = contacts.filter((contact) => contact.active);
  const inactive = contacts.filter((contact) => !contact.active);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!user || !draft) return;
    const parsed = contactSchema.safeParse(draft);
    if (!parsed.success) {
      const next: Record<string, string> = {};
      parsed.error.issues.forEach((issue) => { next[String(issue.path[0])] = issue.message; });
      setErrors(next);
      return;
    }
    try {
      await saveContact(user.uid, { ...draft, ...parsed.data, accountId }, contacts);
      toast("담당자를 저장했습니다.");
      setDraft(null);
      setErrors({});
    } catch (error) {
      toast(callableErrorMessage(error), "error");
    }
  }

  async function deactivate(contact: ContactRecord, activeState: boolean) {
    if (!user) return;
    if (!activeState && !window.confirm("담당자를 비활성화하면 새 방문 기록의 담당자 목록에서 빠집니다. 과거 기록의 이름은 유지됩니다.")) return;
    try {
      await saveContact(user.uid, { ...contact, active: activeState, isPrimary: activeState ? contact.isPrimary : false }, contacts);
      toast(activeState ? "담당자를 다시 활성화했습니다." : "담당자를 비활성화했습니다.");
    } catch (error) {
      toast(callableErrorMessage(error), "error");
    }
  }

  if (draft) {
    return (
      <form className="grid gap-3 rounded-xl border border-line bg-white p-4" onSubmit={save} noValidate>
        <h3 className="font-bold">{draft.id ? "담당자 수정" : "담당자 추가"}</h3>
        <Field id="contact-name" label="이름" required error={errors.name}>{(aria) => <TextInput {...aria} autoFocus value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />}</Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field id="contact-role" label="직책" error={errors.role}>{(aria) => <TextInput {...aria} placeholder="예: 구매 과장" value={draft.role} onChange={(event) => setDraft({ ...draft, role: event.target.value })} />}</Field>
          <Field id="contact-department" label="부서">{(aria) => <TextInput {...aria} value={draft.department} onChange={(event) => setDraft({ ...draft, department: event.target.value })} />}</Field>
        </div>
        <Field id="contact-phone" label="전화번호" error={errors.phone}>{(aria) => <TextInput {...aria} type="tel" inputMode="tel" placeholder="010-0000-0000" value={draft.phone} onChange={(event) => setDraft({ ...draft, phone: event.target.value })} />}</Field>
        <Field id="contact-email" label="이메일" error={errors.email}>{(aria) => <TextInput {...aria} type="email" inputMode="email" value={draft.email} onChange={(event) => setDraft({ ...draft, email: event.target.value })} />}</Field>
        <Field id="contact-memo" label="메모">{(aria) => <TextArea {...aria} className="min-h-20" value={draft.memo} onChange={(event) => setDraft({ ...draft, memo: event.target.value })} />}</Field>
        <label className="flex min-h-11 items-center justify-between gap-3 text-sm font-medium">
          대표 담당자로 지정
          <Switch checked={draft.isPrimary} onCheckedChange={(checked) => setDraft({ ...draft, isPrimary: checked })} />
        </label>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => { setDraft(null); setErrors({}); }}>취소</Button>
          <Button type="submit" variant="primary">저장</Button>
        </div>
      </form>
    );
  }

  return (
    <div className="grid gap-2.5">
      {active.length === 0 ? <p className="rounded-xl border border-dashed border-line-strong bg-white px-4 py-6 text-center text-sm text-subtle">등록된 담당자가 없습니다.</p> : null}
      {active.map((contact) => <ContactCard key={contact.id} contact={contact} onEdit={() => setDraft(contact)} onToggle={() => deactivate(contact, false)} />)}
      <Button type="button" variant="soft" onClick={() => setDraft({ id: "", accountId, name: "", role: "", department: "", phone: "", email: "", memo: "", isPrimary: active.length === 0, active: true })}><Plus aria-hidden="true" />담당자 추가</Button>
      {inactive.length > 0 ? <p className="section-title pt-3">비활성 담당자</p> : null}
      {inactive.map((contact) => <ContactCard key={contact.id} contact={contact} onEdit={() => setDraft(contact)} onToggle={() => deactivate(contact, true)} />)}
    </div>
  );
}

function ContactCard({ contact, onEdit, onToggle }: { contact: ContactRecord; onEdit: () => void; onToggle: () => void }) {
  const href = telHref(contact.phone);
  return (
    <article className={clsx("rounded-xl border border-line bg-white p-3.5", !contact.active && "opacity-70")}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-1.5 font-bold">
            {contact.name}
            {contact.isPrimary ? <span className="badge badge-primary">대표</span> : null}
            {!contact.active ? <span className="badge">비활성</span> : null}
          </p>
          <p className="text-[13px] text-subtle">{[contact.role, contact.department].filter(Boolean).join(" · ") || "직책 없음"}</p>
        </div>
        <DropdownMenu.Root>
          <DropdownMenu.Trigger className="btn btn-ghost btn-icon btn-sm" aria-label={`${contact.name} 메뉴`}><MoreHorizontal aria-hidden="true" /></DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content className="menu" align="end">
              <DropdownMenu.Item className="menu-item" onSelect={onEdit}><Pencil aria-hidden="true" />수정</DropdownMenu.Item>
              <DropdownMenu.Item className="menu-item" onSelect={onToggle}>{contact.active ? "비활성화" : "다시 활성화"}</DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>
      {(href || contact.email) ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {href ? <a className="btn btn-secondary btn-sm" href={href}><Phone aria-hidden="true" />{contact.phone}</a> : null}
          {contact.email ? <a className="btn btn-ghost btn-sm" href={`mailto:${contact.email}`}><Mail aria-hidden="true" />{contact.email}</a> : null}
        </div>
      ) : null}
    </article>
  );
}

function todayYmd() {
  return addSeoulDays(new Date().toISOString(), 0);
}

function ManualReminderDialog({ open, accountId, onOpenChange }: { open: boolean; accountId: string; onOpenChange: (open: boolean) => void }) {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [withTime, setWithTime] = useState(false);
  const [leadDays, setLeadDays] = useState(1);
  const [memo, setMemo] = useState("");
  const [error, setError] = useState("");
  const toast = useToast();
  const quick = [
    { label: "내일", days: 1 },
    { label: "3일 뒤", days: 3 },
    { label: "1주 뒤", days: 7 },
    { label: "2주 뒤", days: 14 },
    { label: "한 달 뒤", days: 30 },
  ];

  async function save() {
    if (!title.trim() || !date) {
      setError("무엇을 할지와 날짜를 입력해 주세요.");
      return;
    }
    try {
      const dueAt = withTime && time ? new Date(`${date}T${time}:00+09:00`).toISOString() : new Date(`${date}T00:00:00+09:00`).toISOString();
      await callCreateManualReminder({
        clientRequestId: createId("req"),
        accountId,
        title: title.trim(),
        dueAt,
        allDay: !withTime,
        leadDays,
        memo,
      });
      toast("알림을 추가했습니다.");
      onOpenChange(false);
      setTitle("");
      setDate("");
      setMemo("");
      setError("");
    } catch (caught) {
      setError(callableErrorMessage(caught));
    }
  }

  return (
    <Modal open={open} title="알림 추가" description="정한 날짜가 되면 알림함과 지도에 표시됩니다." onOpenChange={onOpenChange}>
      <div className="grid gap-4">
        {error ? <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p> : null}
        <Field id="manual-title" label="무엇을 할까요?" required>{(aria) => <TextInput {...aria} placeholder="예: 견적서 보내기" value={title} onChange={(event) => setTitle(event.target.value)} />}</Field>
        <div className="grid gap-2">
          <Field id="manual-date" label="날짜" required>{(aria) => <TextInput {...aria} type="date" min={todayYmd()} value={date} onChange={(event) => setDate(event.target.value)} />}</Field>
          <div className="no-scrollbar flex gap-1.5 overflow-x-auto">
            {quick.map((item) => {
              const value = addSeoulDays(new Date().toISOString(), item.days);
              return <button key={item.label} type="button" className="chip min-h-9 px-3 text-[13px]" aria-pressed={date === value} onClick={() => setDate(value)}>{item.label}</button>;
            })}
          </div>
        </div>
        <label className="flex min-h-11 items-center justify-between gap-3 text-sm font-medium">
          시간도 정하기
          <Switch checked={withTime} onCheckedChange={setWithTime} />
        </label>
        {withTime ? <Field id="manual-time" label="시간">{(aria) => <TextInput {...aria} type="time" value={time} onChange={(event) => setTime(event.target.value)} />}</Field> : null}
        <Field id="manual-lead" label="며칠 전부터 미리 알려 드릴까요?" help="0이면 당일에만 표시됩니다.">
          {(aria) => (
            <div className="flex items-center gap-2">
              <TextInput {...aria} className="w-24" inputMode="numeric" type="number" min={0} max={365} value={leadDays} onChange={(event) => setLeadDays(Number(event.target.value))} />
              <span className="text-sm text-subtle">일 전부터</span>
            </div>
          )}
        </Field>
        <Field id="manual-memo" label="메모">{(aria) => <TextArea {...aria} className="min-h-20" value={memo} onChange={(event) => setMemo(event.target.value)} />}</Field>
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>취소</Button><Button type="button" variant="primary" onClick={save}>알림 저장</Button></div>
      </div>
    </Modal>
  );
}

export const salesStatusOptions = SALES_STATUSES;
