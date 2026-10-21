"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { clsx } from "clsx";
import { collection, doc, getDocs, limit, orderBy, query, updateDoc, where } from "firebase/firestore";
import { BellOff, Building2, CalendarClock, Check, CheckCheck } from "lucide-react";
import { addSeoulDays, formatDateInSeoul } from "@shared/dates";
import { getReminderTimeStatus } from "@shared/reminderStatus";
import { TIME_STATUS_LABEL, TASK_STATUS_LABEL } from "@shared/labels";
import { useAuth } from "@/lib/auth";
import { callUpdateReminder, callableErrorMessage } from "@/lib/callables";
import { useData } from "@/lib/data";
import { getFirebase } from "@/lib/firebase";
import { reminderWhen } from "@/lib/format";
import { useNow } from "@/lib/hooks";
import { reminderFromDoc, type ReminderRecord } from "@/lib/records";
import { Modal, useToast } from "./Providers";
import { Button, EmptyState, Field, PageHeader, Switch, TextInput } from "./ui";

type Tab = "overdue" | "today" | "upcoming" | "done";

export function NotificationsScreen() {
  const { reminders } = useData();
  const { user } = useAuth();
  const now = useNow();
  const router = useRouter();
  const toast = useToast();
  const [chosenTab, setTab] = useState<Tab | null>(null);
  const [done, setDone] = useState<ReminderRecord[]>([]);
  const [editing, setEditing] = useState<ReminderRecord | null>(null);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [withTime, setWithTime] = useState(false);
  const [leadDays, setLeadDays] = useState(1);

  const openItems = reminders.map((reminder) => ({
    reminder,
    timeStatus: getReminderTimeStatus({ dueAt: reminder.dueAt, allDay: reminder.allDay, leadDays: reminder.leadDays, now }),
  }));
  const counts = {
    overdue: openItems.filter((item) => item.timeStatus === "overdue").length,
    today: openItems.filter((item) => item.timeStatus === "today").length,
    upcoming: openItems.filter((item) => item.timeStatus === "scheduled" || item.timeStatus === "soon").length,
  };
  const tab: Tab = chosenTab ?? (counts.overdue ? "overdue" : counts.today ? "today" : "upcoming");

  useEffect(() => {
    if (!user || tab !== "done") return;
    void getDocs(query(collection(getFirebase().db, `users/${user.uid}/reminders`), where("status", "==", "done"), orderBy("completedAt", "desc"), limit(50))).then((snap) => {
      setDone(snap.docs.flatMap((item) => {
        const reminder = reminderFromDoc(item.id, item.data());
        return reminder ? [reminder] : [];
      }));
    }).catch(() => toast("완료된 알림을 불러오지 못했습니다.", "error"));
  }, [user, tab, toast]);

  const visible = tab === "done"
    ? done.map((reminder) => ({ reminder, timeStatus: getReminderTimeStatus({ dueAt: reminder.dueAt, allDay: reminder.allDay, leadDays: reminder.leadDays, now }) }))
    : openItems.filter((item) => tab === "upcoming" ? item.timeStatus === "scheduled" || item.timeStatus === "soon" : item.timeStatus === tab);

  async function markRead(reminder: ReminderRecord) {
    if (!user || reminder.read) return;
    await updateDoc(doc(getFirebase().db, `users/${user.uid}/reminders/${reminder.id}`), { read: true }).catch(() => undefined);
  }

  async function complete(reminder: ReminderRecord) {
    try {
      await callUpdateReminder({ reminderId: reminder.id, action: "complete" });
      toast("알림을 완료했습니다.");
    } catch (error) {
      toast(callableErrorMessage(error), "error");
    }
  }

  async function reschedule() {
    if (!editing || !date) return;
    try {
      const dueAt = withTime && time ? new Date(`${date}T${time}:00+09:00`).toISOString() : new Date(`${date}T00:00:00+09:00`).toISOString();
      await callUpdateReminder({ reminderId: editing.id, action: "reschedule", dueAt, allDay: !withTime, leadDays });
      toast("알림 날짜를 바꿨습니다.");
      setEditing(null);
    } catch (error) {
      toast(callableErrorMessage(error), "error");
    }
  }

  const tabs: Array<{ id: Tab; label: string; count?: number }> = [
    { id: "overdue", label: "지연", count: counts.overdue },
    { id: "today", label: "오늘", count: counts.today },
    { id: "upcoming", label: "다가오는", count: counts.upcoming },
    { id: "done", label: "완료" },
  ];
  const emptyText: Record<Tab, string> = {
    overdue: "늦어진 알림이 없습니다. 잘하고 계세요!",
    today: "오늘 챙길 알림이 없습니다.",
    upcoming: "다가오는 알림이 없습니다. 방문 기록에 ‘다음 연락일’을 넣으면 여기에 쌓입니다.",
    done: "완료한 알림이 없습니다.",
  };

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto grid max-w-3xl gap-4 p-4 pb-10 lg:p-8">
        <PageHeader title="알림" description="다음 연락일, 재방문, 직접 추가한 알림을 모아 봅니다." />
        <div className="seg w-full sm:w-auto" role="tablist" aria-label="알림 구분">
          {tabs.map((item) => (
            <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} onClick={() => setTab(item.id)}>
              <span className="flex items-center justify-center gap-1.5">
                {item.label}
                {item.count ? <span className={clsx("grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-[11px] font-bold", item.id === "overdue" ? "bg-danger text-white" : item.id === "today" ? "bg-primary text-white" : "bg-[#dfe4ec] text-muted")}>{item.count}</span> : null}
              </span>
            </button>
          ))}
        </div>
        {visible.length === 0 ? (
          <div className="card">
            <EmptyState icon={tab === "done" ? <CheckCheck aria-hidden="true" /> : <BellOff aria-hidden="true" />} title="표시할 알림이 없습니다" description={emptyText[tab]} />
          </div>
        ) : null}
        <ul className="grid gap-2.5">
          {visible.map(({ reminder, timeStatus }) => {
            const unread = !reminder.read && reminder.status === "open";
            const accent = tab === "done" ? "border-l-[#cbd2dc]" : timeStatus === "overdue" ? "border-l-danger" : timeStatus === "today" ? "border-l-primary" : timeStatus === "soon" ? "border-l-warn" : "border-l-[#cbd2dc]";
            return (
              <li key={reminder.id} className={clsx("card border-l-4 p-4", accent)} onMouseEnter={() => markRead(reminder)} onFocus={() => markRead(reminder)} onClick={() => markRead(reminder)}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2">
                      <span className="font-bold">{reminder.title}</span>
                      {unread ? <span className="size-2 rounded-full bg-primary" aria-label="읽지 않음" /> : null}
                    </p>
                    <button type="button" className="mt-0.5 flex items-center gap-1 text-sm font-medium text-primary-ink hover:underline" onClick={() => router.push(`/map?account=${reminder.accountId}`)}>
                      <Building2 className="size-3.5" aria-hidden="true" />{reminder.accountName}
                    </button>
                  </div>
                  <span className={clsx("badge shrink-0", tab === "done" ? "badge-success" : timeStatus === "overdue" ? "badge-danger" : timeStatus === "today" ? "badge-primary" : timeStatus === "soon" ? "badge-warn" : "")}>
                    {tab === "done" ? TASK_STATUS_LABEL[reminder.status] : TIME_STATUS_LABEL[timeStatus]}
                  </span>
                </div>
                <p className="mt-2 flex items-center gap-1.5 text-sm text-muted"><CalendarClock className="size-4 text-subtle" aria-hidden="true" />{reminderWhen(reminder)}</p>
                {reminder.memo ? <p className="mt-1.5 whitespace-pre-line rounded-lg bg-[#f6f8fb] px-3 py-2 text-sm text-muted">{reminder.memo}</p> : null}
                {reminder.status === "open" ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button type="button" size="sm" variant="primary" onClick={() => complete(reminder)}><Check aria-hidden="true" />완료</Button>
                    <Button type="button" size="sm" variant="secondary" onClick={() => { setEditing(reminder); setDate(reminder.dueAt ? formatDateInSeoul(new Date(reminder.dueAt)) : ""); setLeadDays(reminder.leadDays); setWithTime(!reminder.allDay); }}><CalendarClock aria-hidden="true" />날짜 미루기</Button>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      </div>
      <Modal open={Boolean(editing)} title="알림 날짜 바꾸기" description={editing ? `${editing.accountName} · ${editing.title}` : undefined} onOpenChange={() => setEditing(null)}>
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Field id="reschedule-date" label="날짜" required>{(aria) => <TextInput {...aria} type="date" value={date} onChange={(event) => setDate(event.target.value)} />}</Field>
            <div className="no-scrollbar flex gap-1.5 overflow-x-auto">
              {[["내일", 1], ["3일 뒤", 3], ["1주 뒤", 7], ["2주 뒤", 14]].map(([label, days]) => {
                const value = addSeoulDays(new Date().toISOString(), Number(days));
                return <button key={label} type="button" className="chip min-h-9 px-3 text-[13px]" aria-pressed={date === value} onClick={() => setDate(value)}>{label}</button>;
              })}
            </div>
          </div>
          <label className="flex min-h-11 items-center justify-between gap-3 text-sm font-medium">
            시간도 정하기
            <Switch checked={withTime} onCheckedChange={setWithTime} />
          </label>
          {withTime ? <Field id="reschedule-time" label="시간">{(aria) => <TextInput {...aria} type="time" value={time} onChange={(event) => setTime(event.target.value)} />}</Field> : null}
          <Field id="reschedule-lead" label="며칠 전부터 미리 알려 드릴까요?">
            {(aria) => (
              <div className="flex items-center gap-2">
                <TextInput {...aria} className="w-24" type="number" min={0} value={leadDays} onChange={(event) => setLeadDays(Number(event.target.value))} />
                <span className="text-sm text-subtle">일 전부터</span>
              </div>
            )}
          </Field>
          <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setEditing(null)}>취소</Button><Button type="button" variant="primary" onClick={reschedule}>저장</Button></div>
        </div>
      </Modal>
    </div>
  );
}
